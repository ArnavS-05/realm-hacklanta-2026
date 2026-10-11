import { CONTROL as C } from "./controlConfig";
import {
  Controller,
  add,
  sub,
  mul,
  length,
  distance,
  clamp,
  inverse,
  forward,
} from "./robotics";
import type { V3 } from "./schema";
export type Point = { x: number; y: number; z: number };
export type Observation = {
  landmarks: Point[];
  label: "Left" | "Right";
  confidence: number;
};
export type ControlState =
  | "IDLE"
  | "ARM_CONTROL"
  | "GRIPPING"
  | "HOLD"
  | "ROTATE_LEFT"
  | "ROTATE_RIGHT"
  | "RECENTER";
export type Gesture =
  | "OPEN PALM"
  | "PINCH"
  | "RELEASE"
  | "FIST"
  | "POINT LEFT"
  | "POINT RIGHT"
  | "RELAXED"
  | "NONE";
export type Track = {
  side: number;
  label: "Left" | "Right";
  state: ControlState;
  gesture: Gesture;
  confidence: number;
  stable: boolean;
  pinch: number;
  closed: boolean;
  landmarks: Point[];
  lastSeen: number;
  lastFrame: number;
  rawWrist: Point | null;
  candidate: Gesture;
  candidateSince: number;
  neutral: V3 | null;
  neutralScale: number;
  robotNeutral: V3;
  lastTarget: V3 | null;
  lastGrip: number;
  lastRotate: number;
  rotationLatched: boolean;
  thresholds: { close: number; release: number };
  clamped: boolean;
};
const dist = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function features(lm: Point[]) {
  const scale = dist(lm[5], lm[17]);
  const extended = [8, 12, 16, 20].map(
    (i) => dist(lm[i], lm[0]) > dist(lm[i - 2], lm[0]) * 1.18,
  );
  const curled = [8, 12, 16, 20].every(
    (i) => dist(lm[i], lm[0]) < dist(lm[i - 2], lm[0]) * 1.07,
  );
  const pinch = dist(lm[4], lm[8]) / Math.max(0.015, scale);
  const pointing =
    extended[0] &&
    !extended[1] &&
    !extended[2] &&
    !extended[3] &&
    Math.abs(lm[8].x - lm[5].x) > Math.abs(lm[8].y - lm[5].y) * 1.4;
  return {
    scale,
    pinch,
    open: extended.filter(Boolean).length >= 4,
    fist: curled,
    point: pointing
      ? ((lm[8].x > lm[5].x ? "POINT LEFT" : "POINT RIGHT") as Gesture)
      : null,
  };
}
function track(side: number): Track {
  return {
    side,
    label: side < 0 ? "Left" : "Right",
    state: "IDLE",
    gesture: "NONE",
    confidence: 0,
    stable: false,
    pinch: 0,
    closed: false,
    landmarks: [],
    lastSeen: -Infinity,
    lastFrame: -Infinity,
    rawWrist: null,
    candidate: "NONE",
    candidateSince: 0,
    neutral: null,
    neutralScale: 0.1,
    robotNeutral: [side * 0.4, 1.08, 0.03],
    lastTarget: null,
    lastGrip: -Infinity,
    lastRotate: -Infinity,
    rotationLatched: false,
    thresholds: { close: C.pinchClose, release: C.pinchRelease },
    clamped: false,
  };
}
export class GestureController {
  tracks = [track(-1), track(1)];
  message = "Show an open palm";
  calibration: {
    stage: "open" | "pinch" | "relax";
    side: number | null;
    since: number;
    samples: number[];
    scale: number[];
    centers: V3[];
  } | null = null;
  calibrationMessage = "";
  calibrated = false;
  bothSince: number | null = null;
  bothLatched = false;
  lastRecenter = -Infinity;
  lastTime = -Infinity;
  constructor(public robot: Controller) {
    this.tracks.forEach(
      (t) => (t.closed = robot.arms.find((a) => a.side === t.side)!.closed),
    );
  }
  freeze(t: Track, uncertain = false) {
    t.state = "HOLD";
    t.stable = !uncertain;
    t.lastTarget = null;
    t.neutral = null;
    t.candidate = "NONE";
    const a = this.robot.arms.find((a) => a.side === t.side)!;
    if (!this.robot.running) {
      a.target = [...a.end];
      a.velocity = [0, 0, 0];
      a.speed = 0;
    }
    if (uncertain) this.message = "TRACKING UNCERTAIN";
  }
  beginCalibration() {
    this.calibrated = false;
    this.calibration = {
      stage: "open",
      side: null,
      since: 0,
      samples: [],
      scale: [],
      centers: [],
    };
    this.calibrationMessage = "1 / 3 · Show one open palm";
    this.tracks.forEach((t) => this.freeze(t));
  }
  anchor(t: Track) {
    if (!t.landmarks.length) return;
    const a = this.robot.arms.find((a) => a.side === t.side)!;
    t.neutral = [t.landmarks[0].x, t.landmarks[0].y, t.landmarks[0].z];
    t.neutralScale = features(t.landmarks).scale;
    t.robotNeutral = [...a.end];
    t.lastTarget = [...a.end];
  }
  recenter(now: number) {
    if (this.robot.running || this.robot.paused) return;
    for (const t of this.tracks) {
      this.freeze(t);
      this.anchor(t);
      t.state = "RECENTER";
      t.candidate = "NONE";
      t.candidateSince = now;
    }
    this.lastRecenter = now;
    this.message = "TRACKING RECENTERED";
  }
  private assign(observations: Observation[], now: number) {
    const valid = observations
      .filter(
        (o) =>
          o.landmarks.length === 21 &&
          o.landmarks.every(
            (p) =>
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              Number.isFinite(p.z),
          ) &&
          features(o.landmarks).scale > 0.025 &&
          features(o.landmarks).scale < 0.6,
      )
      .slice(0, 2);
    const cost = (t: Track, o: Observation) => {
      const alive = now - t.lastSeen < C.identityExpiryMs && t.rawWrist;
      return alive
        ? dist(t.rawWrist!, o.landmarks[0]) + (o.label === t.label ? 0 : 0.035)
        : o.label === t.label
          ? 0
          : 1;
    };
    if (valid.length === 2) {
      const direct =
          cost(this.tracks[0], valid[0]) + cost(this.tracks[1], valid[1]),
        swap = cost(this.tracks[0], valid[1]) + cost(this.tracks[1], valid[0]);
      if (Math.abs(direct - swap) < 0.025) return [] as [Track, Observation][];
      const ordered = direct < swap ? valid : [valid[1], valid[0]];
      return this.tracks
        .map((t, i) => [t, ordered[i]] as [Track, Observation])
        .filter(
          ([t, o]) =>
            now - t.lastSeen > C.identityExpiryMs ||
            !t.rawWrist ||
            dist(t.rawWrist, o.landmarks[0]) < C.maxIdentityJump,
        );
    }
    if (valid.length === 1) {
      const ranked = this.tracks
        .map((t) => ({ t, cost: cost(t, valid[0]) }))
        .sort((a, b) => a.cost - b.cost);
      if (Math.abs(ranked[0].cost - ranked[1].cost) < 0.025) return [];
      if (
        ranked[0].cost > C.maxIdentityJump &&
        now - ranked[0].t.lastSeen < C.identityExpiryMs
      )
        return [];
      return [[ranked[0].t, valid[0]]] as [Track, Observation][];
    }
    return [] as [Track, Observation][];
  }
  process(observations: Observation[], now: number) {
    if (now <= this.lastTime) return;
    this.lastTime = now;
    const assignments = this.assign(observations, now),
      seen = new Set<number>();
    for (const [t, o] of assignments) {
      seen.add(t.side);
      const threshold = t.stable ? C.confidenceExit : C.confidenceEnter;
      t.confidence = o.confidence;
      if (o.confidence < threshold) {
        this.freeze(t, true);
        continue;
      }
      const gap = now - t.lastSeen;
      if (gap > C.identityExpiryMs) {
        this.freeze(t);
        t.landmarks = [];
      }
      const alpha = t.landmarks.length
        ? 1 - Math.exp(-(now - t.lastFrame) / C.smoothingMs)
        : 1;
      t.landmarks = o.landmarks.map((p, i) => {
        const previous = t.landmarks[i] || p;
        return {
          x: previous.x + (p.x - previous.x) * alpha,
          y: previous.y + (p.y - previous.y) * alpha,
          z: previous.z + (p.z - previous.z) * alpha,
        };
      });
      t.rawWrist = o.landmarks[0];
      t.lastSeen = now;
      t.lastFrame = now;
      t.stable = true;
      t.pinch = features(t.landmarks).pinch;
      const raw = features(o.landmarks),
        f = features(t.landmarks);
      // Fist wins immediately; it never opens a gripper or drops a payload.
      if (raw.fist) {
        this.freeze(t);
        t.gesture = "FIST";
        this.message = "ARM HOLD";
        continue;
      }
      let gesture: Gesture = f.open ? "OPEN PALM" : f.point || "RELAXED";
      if (t.closed) {
        gesture = f.pinch > t.thresholds.release ? "RELEASE" : "PINCH";
      } else if (f.pinch < t.thresholds.close) gesture = "PINCH";
      t.gesture = gesture;
      if (gesture !== t.candidate) {
        t.candidate = gesture;
        t.candidateSince = now;
      }
    }
    for (const t of this.tracks)
      if (!seen.has(t.side) && now - t.lastSeen > C.trackingLossMs) {
        t.confidence = 0;
        t.gesture = "NONE";
        this.freeze(t, true);
      }
    if (this.calibration) {
      this.sampleCalibration(now);
      return;
    }
    const both = this.tracks.every(
      (t) => t.stable && now - t.lastSeen < 100 && features(t.landmarks).open,
    );
    if (both) {
      this.bothSince ??= now;
      if (
        !this.bothLatched &&
        now - this.bothSince >= C.recenterConfirmMs &&
        now - this.lastRecenter > C.recenterCooldownMs
      ) {
        this.recenter(now);
        this.bothLatched = true;
        return;
      }
      if (this.bothLatched) return;
    } else {
      this.bothSince = null;
      this.bothLatched = false;
    }
    for (const t of this.tracks) {
      if (!t.stable || t.gesture === "FIST" || now - t.lastSeen > 100) continue;
      const age = now - t.candidateSince,
        enabled = !this.robot.paused && !this.robot.running;
      if (
        t.gesture !== "POINT LEFT" &&
        t.gesture !== "POINT RIGHT" &&
        age > C.confirmMs
      )
        t.rotationLatched = false;
      if (t.gesture === "OPEN PALM" && age >= C.confirmMs) {
        if (t.state !== "ARM_CONTROL" && t.state !== "GRIPPING") {
          this.anchor(t);
          t.state = "ARM_CONTROL";
          this.message = "ARM CONTROL ACTIVE";
        }
      } else if (
        t.gesture === "PINCH" &&
        age >= C.pinchConfirmMs &&
        (t.state === "ARM_CONTROL" || t.state === "GRIPPING") &&
        !t.closed &&
        now - t.lastGrip > C.gripCooldownMs
      ) {
        t.closed = true;
        t.state = "GRIPPING";
        t.lastGrip = now;
        this.message = "GRIPPER CLOSED";
        if (enabled)
          this.robot.setTarget(
            t.side,
            [...this.robot.arms.find((a) => a.side === t.side)!.target],
            true,
          );
      } else if (
        t.gesture === "RELEASE" &&
        age >= C.releaseConfirmMs &&
        t.closed &&
        now - t.lastGrip > C.gripCooldownMs
      ) {
        t.closed = false;
        t.state = "ARM_CONTROL";
        if (!t.neutral) this.anchor(t);
        t.lastGrip = now;
        this.message = "GRIPPER OPEN";
        if (enabled)
          this.robot.setTarget(
            t.side,
            [...this.robot.arms.find((a) => a.side === t.side)!.target],
            false,
          );
      } else if (
        (t.gesture === "POINT LEFT" || t.gesture === "POINT RIGHT") &&
        age >= C.confirmMs &&
        !this.tracks.some((t) => t.closed) &&
        !t.rotationLatched &&
        now - t.lastRotate > C.rotationCooldownMs
      ) {
        this.tracks.forEach((other) => this.freeze(other));
        t.state = t.gesture === "POINT LEFT" ? "ROTATE_LEFT" : "ROTATE_RIGHT";
        t.rotationLatched = true;
        t.lastRotate = now;
        if (enabled)
          this.robot.requestRotation(t.state === "ROTATE_LEFT" ? -1 : 1);
        this.message = t.state.replaceAll("_", " ");
        continue;
      }
      if (t.gesture === "RELAXED" && age > C.confirmMs) {
        this.freeze(t);
        this.message = "ARM HOLD";
        continue;
      }
      if (
        enabled &&
        (t.gesture === "OPEN PALM" ||
          t.gesture === "PINCH" ||
          t.gesture === "RELEASE") &&
        (t.state === "ARM_CONTROL" || t.state === "GRIPPING") &&
        t.neutral
      ) {
        const w = t.landmarks[0],
          f = features(t.landmarks);
        const dx = -(w.x - t.neutral[0]) * C.lateralGain,
          dy = -(w.y - t.neutral[1]) * C.verticalGain,
          dz = (f.scale / t.neutralScale - 1) * C.depthGain;
        const desired = add(
          t.robotNeutral,
          add(
            mul(this.robot.controlRight, dx),
            add([0, dy, 0], mul(this.robot.controlDepth, dz)),
          ),
        );
        const s = this.robot.origin(t.side);
        let delta = sub(desired, s);
        const r = length(delta);
        delta = mul(delta, clamp(r, 0.22, 0.91) / Math.max(r, 0.0001));
        let bounded = add(s, delta);
        bounded[1] = clamp(bounded[1], 0.35, 1.9);
        const solved = this.robot.solve(bounded, t.side);
        const target = forward(solved.joints, s, this.robot.bodyYaw).end;
        t.clamped = distance(target, desired) > 0.015;
        if (
          !t.lastTarget ||
          distance(t.lastTarget, target) > C.deadZoneMeters
        ) {
          this.robot.setTarget(t.side, target, t.closed);
          t.lastTarget = target;
        }
      }
    }
    const engaged = this.tracks.find(
      (t) => t.stable && (t.state === "ARM_CONTROL" || t.state === "GRIPPING"),
    );
    const turning = this.tracks.find(
      (t) => t.stable && t.state.startsWith("ROTATE"),
    );
    if (this.robot.held) this.message = "OBJECT GRASPED";
    else if (engaged)
      this.message = engaged.closed ? "GRIPPER CLOSED" : "ARM CONTROL ACTIVE";
    else if (turning) this.message = turning.state.replaceAll("_", " ");
  }
  private sampleCalibration(now: number) {
    const c = this.calibration!;
    const t =
      c.side === null
        ? this.tracks.find((t) => t.stable && t.gesture === "OPEN PALM")
        : this.tracks.find((t) => t.side === c.side);
    if (!t || !t.stable) {
      c.since = 0;
      c.samples = [];
      this.calibrationMessage = "Show your hand clearly to continue";
      return;
    }
    const f = features(t.landmarks);
    const valid =
      c.stage === "open"
        ? f.open
        : c.stage === "pinch"
          ? f.pinch < 0.55 && !f.fist
          : !f.fist && f.pinch > 0.65;
    if (!valid) {
      c.since = 0;
      c.samples = [];
      this.calibrationMessage =
        c.stage === "open"
          ? "1 / 3 · Show one open palm"
          : c.stage === "pinch"
            ? "2 / 3 · Touch thumb and index; keep other fingers loose"
            : "3 / 3 · Release pinch and relax your hand";
      return;
    }
    c.side = t.side;
    if (!c.since) c.since = now;
    c.samples.push(f.pinch);
    if (c.stage === "open") {
      c.scale.push(f.scale);
      c.centers.push([t.landmarks[0].x, t.landmarks[0].y, t.landmarks[0].z]);
    }
    if (now - c.since < C.calibrationSampleMs) return;
    if (c.stage === "open") {
      this.anchor(t);
      c.stage = "pinch";
      c.since = 0;
      c.samples = [];
      this.calibrationMessage = "2 / 3 · Touch thumb and index";
    } else if (c.stage === "pinch") {
      const sorted = [...c.samples].sort((a, b) => a - b);
      const close = clamp(
        sorted[Math.floor(sorted.length / 2)] + 0.09,
        0.16,
        0.45,
      );
      for (const hand of this.tracks)
        hand.thresholds = { close, release: Math.max(0.55, close + 0.22) };
      c.stage = "relax";
      c.since = 0;
      c.samples = [];
      this.calibrationMessage = "3 / 3 · Release pinch and relax";
    } else {
      this.calibration = null;
      this.calibrated = true;
      this.calibrationMessage = "CALIBRATED · Open palm to begin";
      this.tracks.forEach((t) => {
        this.freeze(t);
        this.anchor(t);
      });
      this.message = "TRACKING RECENTERED";
    }
  }
}
