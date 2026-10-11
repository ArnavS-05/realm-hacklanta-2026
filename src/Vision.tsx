import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ScanLine,
  RefreshCw,
  VideoOff,
  Hand,
  Pointer,
  Grab,
  ChevronsLeftRight,
} from "lucide-react";
import type {
  HandLandmarker,
  PoseLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { Controller, clamp } from "./robotics";
import { GestureController, type Observation } from "./gestures";
import { CONTROL } from "./controlConfig";
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
export function Vision({
  controller,
  onSnapshot,
}: {
  controller: Controller;
  onSnapshot: (s: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    stream = useRef<MediaStream | null>(null),
    hand = useRef<HandLandmarker | null>(null),
    pose = useRef<PoseLandmarker | null>(null),
    frame = useRef(0),
    generation = useRef(0),
    active = useRef(false),
    starting = useRef(false);
  const engine = useMemo(() => new GestureController(controller), [controller]);
  const [status, setStatus] = useState("CAMERA OFF"),
    [, refresh] = useState(0),
    [body, setBody] = useState({ tracked: false, angles: [] as number[] }),
    [guide, setGuide] = useState(false);
  function release() {
    generation.current++;
    active.current = false;
    starting.current = false;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    hand.current?.close();
    pose.current?.close();
    hand.current = null;
    pose.current = null;
    if (video.current) video.current.srcObject = null;
    engine.tracks.forEach((t) => engine.freeze(t, true));
  }
  function stop() {
    release();
    setStatus("CAMERA OFF");
    setBody({ tracked: false, angles: [] });
    refresh((n) => n + 1);
  }
  useEffect(() => {
    setStatus("CAMERA OFF");
    return release;
  }, [controller]);
  async function start() {
    if (active.current || starting.current) return;
    starting.current = true;
    const token = ++generation.current;
    setStatus("STARTING CAMERA");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      pending
        .then((s) => {
          if (token !== generation.current)
            s.getTracks().forEach((t) => t.stop());
        })
        .catch(() => {});
      const media = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Camera permission timed out")),
            15000,
          );
        }),
      ]);
      clearTimeout(timer);
      if (token !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      setStatus("LOADING VISION");
      const { FilesetResolver, HandLandmarker, PoseLandmarker } =
        await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("/vision/wasm");
      const h = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/vision/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.65,
      });
      if (token !== generation.current) {
        h.close();
        return;
      }
      hand.current = h;
      const p = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/vision/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.7,
        minPosePresenceConfidence: 0.7,
        minTrackingConfidence: 0.65,
      });
      if (token !== generation.current) {
        p.close();
        return;
      }
      pose.current = p;
      active.current = true;
      starting.current = false;
      setStatus("CV ONLINE");
      let previous = 0,
        iteration = 0,
        bodyLandmarks: NormalizedLandmark[] = [];
      const loop = (now: number) => {
        if (!active.current || !video.current) return;
        try {
          if (now - previous >= 50 && video.current.readyState >= 2) {
            previous = now;
            const result = h.detectForVideo(video.current, now);
            const observations: Observation[] = result.landmarks.map(
              (landmarks, i) => ({
                landmarks,
                label: result.handedness[i][0].categoryName as "Left" | "Right",
                confidence: result.handedness[i][0].score,
              }),
            );
            engine.process(observations, now);
            if (iteration++ % 3 === 0) {
              const b = p.detectForVideo(video.current, now),
                lm = b.landmarks[0];
              const tracked = Boolean(
                lm &&
                [11, 12, 13, 14, 15, 16].every(
                  (i) => (lm[i].visibility ?? 0) >= CONTROL.poseVisibility,
                ),
              );
              bodyLandmarks = tracked ? lm : [];
              const angle = (
                a: NormalizedLandmark,
                b: NormalizedLandmark,
                c: NormalizedLandmark,
              ) => {
                const u = [a.x - b.x, a.y - b.y, a.z - b.z],
                  v = [c.x - b.x, c.y - b.y, c.z - b.z];
                return (
                  (Math.acos(
                    clamp(
                      u.reduce((n, x, i) => n + x * v[i], 0) /
                        (Math.hypot(...u) * Math.hypot(...v) || 1),
                      -1,
                      1,
                    ),
                  ) *
                    180) /
                  Math.PI
                );
              };
              setBody({
                tracked,
                angles: tracked
                  ? [
                      angle(lm[24], lm[12], lm[14]),
                      angle(lm[12], lm[14], lm[16]),
                      angle(lm[14], lm[16], lm[20]),
                    ]
                  : [],
              });
            }
            const ctx = canvas.current!.getContext("2d")!;
            ctx.clearRect(0, 0, 640, 480);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#6ea3bd";
            for (const [a, b] of [
              [11, 13],
              [13, 15],
              [12, 14],
              [14, 16],
              [11, 12],
              [11, 23],
              [12, 24],
            ]) {
              if (bodyLandmarks.length) {
                ctx.beginPath();
                ctx.moveTo(bodyLandmarks[a].x * 640, bodyLandmarks[a].y * 480);
                ctx.lineTo(bodyLandmarks[b].x * 640, bodyLandmarks[b].y * 480);
                ctx.stroke();
              }
            }
            for (const t of engine.tracks) {
              if (!t.stable || now - t.lastSeen > 100) continue;
              ctx.strokeStyle = t.state === "HOLD" ? "#f5b87b" : "#b4ed79";
              ctx.fillStyle = ctx.strokeStyle;
              for (const [a, b] of edges) {
                ctx.beginPath();
                ctx.moveTo(t.landmarks[a].x * 640, t.landmarks[a].y * 480);
                ctx.lineTo(t.landmarks[b].x * 640, t.landmarks[b].y * 480);
                ctx.stroke();
              }
              for (const pt of t.landmarks) {
                ctx.beginPath();
                ctx.arc(pt.x * 640, pt.y * 480, 2.5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            refresh((n) => n + 1);
          }
          frame.current = requestAnimationFrame(loop);
        } catch {
          stop();
          setStatus("Vision stopped · restart camera");
        }
      };
      frame.current = requestAnimationFrame(loop);
    } catch (error) {
      clearTimeout(timer);
      if (token !== generation.current) return;
      stop();
      setStatus(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission denied · use pointer controls"
          : "Camera unavailable · check permission or use pointer controls",
      );
    }
  }
  const focused =
    engine.tracks.find((t) => t.state === "GRIPPING") ||
    engine.tracks.find((t) => t.stable) ||
    engine.tracks[1];
  return (
    <section className="panel vision">
      <div className="panel-heading">
        <span>
          <ScanLine size={14} /> OPERATOR VISION
        </span>
        <span className={active.current ? "online" : "muted"}>
          {active.current ? "CV ONLINE" : "LOCAL VISION"}
        </span>
      </div>
      <div className="camera">
        <video ref={video} muted playsInline />
        <canvas ref={canvas} width={640} height={480} />
        {!active.current && (
          <div className="camera-placeholder">
            <Camera size={25} />
            <p>Your body. The controller.</p>
            <button onClick={start} disabled={starting.current}>
              {starting.current ? "Starting…" : "Enable camera"}
            </button>
          </div>
        )}
        <span className="camera-tag">MIRRORED · LOCAL PROCESSING</span>
      </div>
      {!active.current && (
        <div className="camera-status" role="status">
          {status}
        </div>
      )}
      <div className="hand-scores">
        {engine.tracks.map((t) => (
          <div key={t.side}>
            <span>{t.label.toUpperCase()} HAND</span>
            <strong className={t.stable ? "online" : ""}>
              {t.confidence ? Math.round(t.confidence * 100) + "%" : "—"}
            </strong>
            <small>
              {t.stable ? t.state.replaceAll("_", " ") : "NOT TRACKED"}
            </small>
          </div>
        ))}
      </div>
      <div className="gesture-status" role="status">
        {active.current ? engine.message : "Open palm → move → pinch → release"}
      </div>
      <div className="gesture-values">
        <span>
          GESTURE<strong>{focused.gesture}</strong>
        </span>
        <span>
          CONTROL STATE<strong>{focused.state.replaceAll("_", " ")}</strong>
        </span>
        <span>
          PINCH
          <strong>{focused.stable ? focused.pinch.toFixed(2) : "—"}</strong>
        </span>
        <span>
          TRACKING
          <strong className={focused.stable ? "online" : ""}>
            {focused.stable
              ? focused.clamped
                ? "WORKSPACE CLAMPED"
                : "STABLE"
              : "UNCERTAIN"}
          </strong>
        </span>
      </div>
      {engine.calibrationMessage && (
        <div className="calibration-callout">
          {engine.calibrationMessage}
          {engine.calibration && (
            <button
              className="mini"
              onClick={() => {
                engine.calibration = null;
                engine.calibrationMessage = "";
                refresh((n) => n + 1);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {body.tracked && (
        <div className="small muted">
          Body pose · {body.angles.map((n) => Math.round(n) + "°").join(" / ")}
        </div>
      )}
      <div className="button-row">
        <button
          className="mini"
          onClick={() => {
            engine.beginCalibration();
            refresh((n) => n + 1);
          }}
          disabled={!active.current}
        >
          <RefreshCw size={11} /> Calibrate hands
        </button>
        <button
          className="mini"
          onClick={() => {
            engine.recenter(performance.now());
            refresh((n) => n + 1);
          }}
          disabled={!active.current}
        >
          Recenter
        </button>
        <button
          className="mini"
          disabled={!stream.current || starting.current}
          onClick={() => {
            const c = document.createElement("canvas");
            c.width = video.current!.videoWidth;
            c.height = video.current!.videoHeight;
            c.getContext("2d")!.drawImage(video.current!, 0, 0);
            onSnapshot(c.toDataURL("image/jpeg", 0.85));
          }}
        >
          Snapshot
        </button>
        <button className="icon-button" aria-label="Stop camera" onClick={stop}>
          <VideoOff size={13} />
        </button>
      </div>
      <button
        className="gesture-help-toggle"
        aria-expanded={guide}
        onClick={() => setGuide(!guide)}
      >
        {guide ? "Hide" : "Show"} gesture guide <Hand size={12} />
      </button>
      {guide && (
        <div className="gesture-guide">
          {[
            [Hand, "OPEN PALM", "Hold 0.3 s to engage"],
            [Pointer, "PINCH", "Thumb + index to grab"],
            [ChevronsLeftRight, "RELEASE", "Separate to drop"],
            [Grab, "FIST", "Immediate arm hold"],
            [Pointer, "POINT", "Hold to turn 15°"],
            [Hand, "TWO PALMS", "Hold to recenter"],
          ].map(([Icon, label, detail]) => {
            const Glyph = Icon as typeof Hand;
            return (
              <div key={label as string}>
                <Glyph size={17} />
                <span>
                  <strong>{label as string}</strong>
                  <small>{detail as string}</small>
                </span>
              </div>
            );
          })}
          <p>
            Keep fingers visible. Pinch with the other fingers loose. Hand
            percentages are identity confidence; model presence thresholds and
            landmark geometry also gate motion.
          </p>
        </div>
      )}
    </section>
  );
}
