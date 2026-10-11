import type { Scene, V3, Plan, SceneObject } from "./schema";
import { CONTROL } from "./controlConfig";
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const mul = (a: V3, n: number): V3 => [a[0] * n, a[1] * n, a[2] * n];
export const length = (a: V3) => Math.hypot(...a);
export const distance = (a: V3, b: V3) => length(sub(a, b));
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const LIMITS = {
  reach: 0.94,
  maxVelocity: 0.65,
  maxAcceleration: 1.8,
  jointVelocity: 1.8,
  jointAcceleration: 4,
  upper: 0.48,
  fore: 0.48,
  yaw: [-2.4, 2.4],
  pitch: [-1.3, 2.4],
  elbow: [0.12, 2.75],
};
export function shoulder(side: number, bodyYaw = 0): V3 {
  return [
    side * 0.29 * Math.cos(bodyYaw),
    1.38,
    0.58 - side * 0.29 * Math.sin(bodyYaw),
  ];
}
export function forward(j: V3, s: V3, bodyYaw = 0) {
  const [, pitch, elbow] = j;
  const yaw = j[0] - bodyYaw;
  const a: V3 = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ];
  const b: V3 = [
    Math.sin(yaw) * Math.cos(pitch - elbow),
    Math.sin(pitch - elbow),
    -Math.cos(yaw) * Math.cos(pitch - elbow),
  ];
  const joint = add(s, mul(a, LIMITS.upper));
  return { elbow: joint, end: add(joint, mul(b, LIMITS.fore)) };
}
export function inverse(
  target: V3,
  s: V3,
  bodyYaw = 0,
): { joints: V3; status: string } {
  const d = sub(target, s),
    r = length(d),
    h = Math.hypot(d[0], d[2]);
  const elbow = Math.acos(
    clamp(
      (r * r - LIMITS.upper ** 2 - LIMITS.fore ** 2) /
        (2 * LIMITS.upper * LIMITS.fore),
      -1,
      1,
    ),
  );
  const joints: V3 = [
    Math.atan2(
      Math.sin(Math.atan2(d[0], -d[2]) + bodyYaw),
      Math.cos(Math.atan2(d[0], -d[2]) + bodyYaw),
    ),
    Math.atan2(d[1], h) +
      Math.atan2(
        LIMITS.fore * Math.sin(elbow),
        LIMITS.upper + LIMITS.fore * Math.cos(elbow),
      ),
    elbow,
  ];
  const ranges = [LIMITS.yaw, LIMITS.pitch, LIMITS.elbow];
  let status = r > LIMITS.reach || r < 0.19 ? "OUTSIDE WORKSPACE" : "ACCEPTED";
  if (
    status === "ACCEPTED" &&
    joints.some((n, i) => n < ranges[i][0] || n > ranges[i][1])
  )
    status = "JOINT LIMIT";
  return {
    joints: joints.map((n, i) => clamp(n, ranges[i][0], ranges[i][1])) as V3,
    status,
  };
}
export function objectPosition(o: SceneObject, scene: Scene): V3 {
  const s = scene.surfaces.find((s) => s.id === o.supportSurface);
  return [
    (o.positionNormalized.x - 0.5) * (s?.width || 2) * 0.8,
    (s?.height || 0) + o.approximateScale.y / 2 + 0.008,
    (o.positionNormalized.y - 0.5) * (s?.depth || 1) * 0.8 - 0.13,
  ];
}
export type Bounds = { center: V3; half: V3 };
export function sceneBounds(scene: Scene): Bounds[] {
  return [
    ...scene.surfaces.map((s, i) => ({
      center: [0, s.height - 0.045, -0.13 - i * 0.25] as V3,
      half: [s.width / 2, 0.045, s.depth / 2] as V3,
    })),
    ...scene.objects
      .filter((o) => !o.interactable || scene.obstacles.includes(o.id))
      .map((o) => ({
        center: objectPosition(o, scene),
        half: [
          o.approximateScale.x / 2,
          o.approximateScale.y / 2,
          o.approximateScale.z / 2,
        ] as V3,
      })),
  ];
}
export function inBox(p: V3, b: Bounds, padding = 0.025) {
  return p.every((n, i) => Math.abs(n - b.center[i]) < b.half[i] + padding);
}
export function segmentHits(a: V3, b: V3, box: Bounds, padding = 0.04) {
  let low = 0,
    high = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i],
      lo = box.center[i] - box.half[i] - padding,
      hi = box.center[i] + box.half[i] + padding;
    if (Math.abs(d) < 1e-8) {
      if (a[i] < lo || a[i] > hi) return false;
    } else {
      let t1 = (lo - a[i]) / d,
        t2 = (hi - a[i]) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      low = Math.max(low, t1);
      high = Math.min(high, t2);
      if (low > high) return false;
    }
  }
  return true;
}
export type Arm = {
  side: number;
  joints: V3;
  velocity: V3;
  target: V3;
  closed: boolean;
  end: V3;
  elbow: V3;
  status: string;
  speed: number;
  lastStatus: string;
};
export type Metrics = {
  elapsed: number;
  path: number;
  energy: number;
  collisions: number;
  limits: number;
  corrections: number;
  ideal: number;
};
export class Controller {
  bodyYaw = 0;
  rotationTarget = 0;
  rotationSpeed = 0;
  controlRight: V3 = [-0.79, 0, -0.61];
  controlDepth: V3 = [0.61, 0, -0.79];
  arms: Arm[];
  scene: Scene;
  held: string | null = null;
  heldSide = 1;
  heldOffset: V3 = [0, 0, 0];
  positions: Record<string, V3> = {};
  metrics: Metrics = {
    elapsed: 0,
    path: 0,
    energy: 0,
    collisions: 0,
    limits: 0,
    corrections: 0,
    ideal: 0,
  };
  plan: Plan | null = null;
  stepIndex = -1;
  stepTime = 0;
  running = false;
  paused = false;
  complete = false;
  level = 0;
  message = "Ready for embodiment";
  lastStatus = "ACCEPTED";
  original: V3 | null = null;
  placeTarget: V3 | null = null;
  settle = 0;
  released: string | null = null;
  missionTarget: string | null = null;
  constructor(scene: Scene) {
    this.scene = scene;
    this.arms = [-1, 1].map((side) => {
      const target: V3 = [side * 0.4, 1.08, 0.03],
        joints = inverse(target, shoulder(side)).joints;
      return {
        side,
        joints,
        velocity: [0, 0, 0],
        target,
        closed: false,
        ...forward(joints, shoulder(side)),
        status: "ACCEPTED",
        speed: 0,
        lastStatus: "ACCEPTED",
      };
    });
    for (const o of scene.objects)
      this.positions[o.id] = objectPosition(o, scene);
  }
  origin(side: number) {
    return shoulder(side, this.bodyYaw);
  }
  solve(target: V3, side: number) {
    return inverse(target, this.origin(side), this.bodyYaw);
  }
  pose(joints: V3, side: number) {
    return forward(joints, this.origin(side), this.bodyYaw);
  }
  requestRotation(direction: number) {
    if (this.held || this.running || this.paused) {
      this.message = "Release the object before turning";
      return;
    }
    this.rotationTarget = clamp(
      this.rotationTarget + direction * CONTROL.rotationStep,
      -CONTROL.rotationLimit,
      CONTROL.rotationLimit,
    );
  }
  private turn(dt: number) {
    const error = this.rotationTarget - this.bodyYaw;
    if (Math.abs(error) < 0.0001) {
      this.rotationSpeed = 0;
      return;
    }
    const desired =
      Math.sign(error) *
      Math.min(
        CONTROL.rotationVelocity,
        Math.sqrt(2 * CONTROL.rotationAcceleration * Math.abs(error)),
      );
    this.rotationSpeed += clamp(
      desired - this.rotationSpeed,
      -CONTROL.rotationAcceleration * dt,
      CONTROL.rotationAcceleration * dt,
    );
    const change =
        Math.sign(error) *
        Math.min(Math.abs(error), Math.abs(this.rotationSpeed) * dt),
      old = this.bodyYaw;
    this.bodyYaw += change;
    const solutions = this.arms.map((a) => this.solve(a.end, a.side));
    if (
      solutions.some(
        (s, i) =>
          s.status !== "ACCEPTED" ||
          !this.validPose(s.joints, this.arms[i].side),
      )
    ) {
      this.bodyYaw = old;
      this.rotationTarget = old;
      this.rotationSpeed = 0;
      this.message = "ROTATION BLOCKED · COLLISION / REACH";
      this.metrics.collisions++;
      return;
    }
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i];
      a.joints = solutions[i].joints;
      const p = this.pose(a.joints, a.side);
      a.elbow = p.elbow;
      a.end = p.end;
      a.target = [...a.end];
      a.velocity = [0, 0, 0];
    }
  }
  setTarget(side: number, target: V3, closed: boolean) {
    if (this.running) {
      this.metrics.corrections++;
      this.running = false;
      this.message = "Manual takeover";
    }
    const arm = this.arms.find((a) => a.side === side)!;
    arm.target = target;
    arm.closed = closed;
  }
  stop() {
    this.rotationTarget = this.bodyYaw;
    this.rotationSpeed = 0;
    this.running = false;
    this.paused = true;
    for (const a of this.arms) {
      a.target = [...a.end];
      a.velocity = [0, 0, 0];
    }
    this.message = "STOPPED · Resume to move";
  }
  start(plan: Plan) {
    if (this.held)
      throw Error("Release the held object before starting a mission.");
    this.plan = plan;
    this.stepIndex = 0;
    this.stepTime = 0;
    this.running = true;
    this.paused = false;
    this.complete = false;
    this.level = 0;
    this.released = null;
    this.settle = 0;
    this.missionTarget =
      plan.steps.find((s) => s.action === "grasp")?.target ||
      plan.steps[0].target;
    this.original = [...this.positions[this.missionTarget]];
    this.placeTarget = null;
    this.metrics = {
      elapsed: 0,
      path: 0,
      energy: 0,
      collisions: 0,
      limits: 0,
      corrections: 0,
      ideal: 0,
    };
    this.arms.forEach((a) => (a.closed = false));
  }
  validPose(joints: V3, side: number) {
    const s = this.origin(side),
      p = forward(joints, s, this.bodyYaw);
    if (p.end[1] < 0.08) return false;
    for (const b of sceneBounds(this.scene))
      if (segmentHits(s, p.elbow, b) || segmentHits(p.elbow, p.end, b))
        return false;
    const other = this.arms.find((a) => a.side !== side);
    if (other && distance(p.end, other.end) < 0.1) return false;
    if (this.held && this.heldSide === side) {
      const o = this.scene.objects.find((o) => o.id === this.held)!;
      for (const b of sceneBounds(this.scene)) {
        const h: V3 = [
          o.approximateScale.x / 2,
          o.approximateScale.y / 2,
          o.approximateScale.z / 2,
        ];
        if (
          add(p.end, this.heldOffset).every(
            (n, i) => Math.abs(n - b.center[i]) < b.half[i] + h[i] - 0.004,
          )
        )
          return false;
      }
    }
    return true;
  }
  tick(dt: number) {
    dt = clamp(dt, 0, 0.04);
    if (this.paused) return;
    this.turn(dt);
    if (this.original && !this.complete) this.metrics.elapsed += dt;
    if (this.running) this.advancePlan(dt);
    for (const a of this.arms) {
      // Opening a gripper is independent of accepting a new arm target.
      if (this.held && this.heldSide === a.side && !a.closed) {
        this.released = this.held;
        this.held = null;
        this.settle = 0;
        this.message = "Object released · checking placement";
      }
      const solution = this.solve(a.target, a.side);
      a.status = solution.status;
      if (a.status === "ACCEPTED" && !this.validPose(solution.joints, a.side))
        a.status = "COLLISION RISK";
      if (a.status !== "ACCEPTED") {
        a.velocity = [0, 0, 0];
        a.speed = 0;
        if (a.lastStatus !== a.status) {
          if (a.status === "COLLISION RISK") this.metrics.collisions++;
          else this.metrics.limits++;
        }
        a.lastStatus = a.status;
        continue;
      }
      const previous = [...a.end] as V3;
      let vel: V3 = a.velocity.map((v, i) => {
        const error = solution.joints[i] - a.joints[i];
        const desired =
          Math.sign(error) *
          Math.min(
            LIMITS.jointVelocity,
            Math.sqrt(2 * LIMITS.jointAcceleration * Math.abs(error)),
            Math.abs(error) / Math.max(dt, 0.001),
          );
        return (
          v +
          clamp(
            desired - v,
            -LIMITS.jointAcceleration * dt,
            LIMITS.jointAcceleration * dt,
          )
        );
      }) as V3;
      let next = a.joints.map((n, i) => n + vel[i] * dt) as V3;
      let pose = this.pose(next, a.side);
      const speed = distance(previous, pose.end) / Math.max(dt, 0.001);
      const cap = Math.min(
        LIMITS.maxVelocity,
        a.speed + LIMITS.maxAcceleration * dt,
      );
      if (speed > cap) {
        // FK is nonlinear: find an actually admissible step, not an
        // approximate ratio that can slightly exceed the Cartesian cap.
        let low = 0,
          high = 1;
        for (let i = 0; i < 24; i++) {
          const factor = (low + high) / 2;
          const candidate = a.joints.map(
            (n, j) => n + vel[j] * dt * factor,
          ) as V3;
          if (
            distance(previous, this.pose(candidate, a.side).end) /
              Math.max(dt, 0.001) <=
            cap
          )
            low = factor;
          else high = factor;
        }
        vel = mul(vel, low);
        next = a.joints.map((n, i) => n + vel[i] * dt) as V3;
        pose = this.pose(next, a.side);
      }
      // Sweep the whole articulated path, not just the final hand location.
      let clear = true;
      for (let k = 1; k <= 5; k++) {
        const j = a.joints.map((n, i) => n + ((next[i] - n) * k) / 5) as V3;
        if (!this.validPose(j, a.side)) clear = false;
      }
      if (!clear) {
        a.status = "COLLISION RISK";
        a.velocity = [0, 0, 0];
        a.speed = 0;
        if (a.lastStatus !== a.status) this.metrics.collisions++;
        a.lastStatus = a.status;
        continue;
      }
      a.velocity = vel;
      a.joints = next;
      a.elbow = pose.elbow;
      a.end = pose.end;
      a.speed = distance(previous, a.end) / Math.max(dt, 0.001);
      const path = distance(previous, a.end);
      this.metrics.path += path;
      const mass =
        this.held && this.heldSide === a.side
          ? this.scene.objects.find((o) => o.id === this.held)!.massKg
          : 0;
      this.metrics.energy +=
        (1.2 + mass) * 9.81 * Math.max(0, a.end[1] - previous[1]) + 2 * path;
      a.lastStatus = "ACCEPTED";
      if (a.closed && !this.held) {
        const obj = this.scene.objects
          .filter(
            (o) =>
              o.interactable &&
              !this.scene.obstacles.includes(o.id) &&
              distance(this.positions[o.id], a.end) <
                Math.max(0.085, o.approximateScale.x * 0.65),
          )
          .sort(
            (left, right) =>
              distance(this.positions[left.id], a.end) -
              distance(this.positions[right.id], a.end),
          )[0];
        if (obj) {
          this.held = obj.id;
          this.heldSide = a.side;
          this.heldOffset = sub(this.positions[obj.id], a.end);
          this.level = Math.max(2, this.level);
          this.released = null;
          this.message = "Grasp secured · " + obj.label;
          if (!this.original) {
            this.original = [...this.positions[obj.id]];
            this.missionTarget = obj.id;
          }
        }
      }
      if (this.held && this.heldSide === a.side) {
        if (!a.closed) {
          this.released = this.held;
          this.held = null;
          this.settle = 0;
          this.message = "Object released · checking placement";
        } else this.positions[this.held] = add(a.end, this.heldOffset);
      }
    }
    if (this.released && !this.held) {
      this.settle += dt;
      const bottle = this.positions[this.released],
        cup = this.scene.objects.find(
          (o) => o.id !== this.released && /cup/i.test(o.label),
        );
      if (cup && this.settle > 0.8) {
        const c = this.positions[cup.id],
          d = Math.hypot(bottle[0] - c[0], bottle[2] - c[2]);
        const obj = this.scene.objects.find((o) => o.id === this.released)!;
        const s = this.scene.surfaces.find((s) => s.id === obj.supportSurface);
        if (
          d > 0.1 &&
          d < 0.31 &&
          Math.abs(bottle[1] - (s?.height || 0) - obj.approximateScale.y / 2) <
            0.05
        ) {
          this.complete = true;
          this.running = false;
          this.level = 5;
          this.metrics.ideal = this.original
            ? distance(this.original, bottle)
            : 0;
          this.message = "MISSION COMPLETE";
        }
      }
    }
  }
  advancePlan(dt: number) {
    if (!this.plan || this.stepIndex < 0) return;
    const step = this.plan.steps[this.stepIndex];
    if (!step) {
      this.running = false;
      return;
    }
    const a = this.arms[1],
      p = this.positions[step.target];
    if (!p) {
      this.running = false;
      this.message = "Plan rejected · target missing";
      return;
    }
    this.stepTime += dt;
    if (this.stepTime > 14) {
      this.running = false;
      this.message =
        "Motion paused · " + a.status + " · adjust target or reset";
      return;
    }
    let target: V3 = [...p];
    switch (step.action) {
      case "locate":
        this.next();
        return;
      case "approach":
        target = [p[0], Math.max(p[1] + 0.25, 1.2), p[2]];
        break;
      case "reach":
        a.closed = false;
        break;
      case "grasp":
        a.closed = true;
        if (this.held === step.target) this.next();
        return;
      case "lift":
        if (!this.held) {
          this.running = false;
          this.message = "No grasp confirmed";
          return;
        }
        target = [a.target[0], 1.28, a.target[2]];
        break;
      case "move":
        this.placeTarget = [p[0] - 0.2, 1.28, p[2]];
        target = this.placeTarget;
        break;
      case "place": {
        const held = this.scene.objects.find((o) => o.id === this.held);
        if (!held) {
          this.running = false;
          this.message = "No object held";
          return;
        }
        const support = this.scene.surfaces.find(
          (s) =>
            s.id ===
            this.scene.objects.find((o) => o.id === step.target)
              ?.supportSurface,
        );
        target = [
          p[0] - 0.2 - this.heldOffset[0],
          (support?.height || 0) +
            held.approximateScale.y / 2 +
            0.02 -
            this.heldOffset[1],
          p[2] - this.heldOffset[2],
        ];
        break;
      }
      case "release":
        a.closed = false;
        if (!this.held) this.next();
        return;
    }
    a.target = target;
    // Settle before reversing direction or closing the gripper. Otherwise
    // downward residual velocity can carry a newly grasped object into a table.
    if (distance(a.end, target) < 0.012 && a.speed < 0.04) {
      if (step.action === "reach") this.level = Math.max(1, this.level);
      this.next();
    }
  }
  next() {
    this.stepIndex++;
    this.stepTime = 0;
    if (this.plan && this.stepIndex >= this.plan.steps.length) {
      this.running = false;
      this.message = "Plan finished · checking result";
    }
  }
}
