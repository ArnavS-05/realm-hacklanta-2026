import test from "node:test";
import assert from "node:assert/strict";
import {
  GestureController,
  features,
  type Observation,
  type Point,
} from "../src/gestures";
import { Controller, distance, sub } from "../src/robotics";
import { demoScene } from "../src/demo";
import { CONTROL } from "../src/controlConfig";
function sample(
  kind = "open",
  x = 0.5,
  label: "Left" | "Right" = "Right",
  confidence = 0.99,
): Observation {
  const lm: Point[] = Array.from({ length: 21 }, () => ({ x, y: 0.7, z: 0 }));
  lm[0] = { x, y: 0.85, z: 0 };
  for (let f = 0; f < 4; f++) {
    const base = 5 + f * 4,
      fx = x - 0.09 + f * 0.075;
    for (let j = 0; j < 4; j++)
      lm[base + j] = { x: fx, y: 0.65 - j * 0.115, z: 0 };
    if (kind === "fist" || (kind === "point" && f > 0)) {
      lm[base + 2].y = 0.65;
      lm[base + 3].y = 0.73;
    }
  }
  lm[4] = { x: x - 0.23, y: 0.59, z: 0 };
  if (kind === "pinch") lm[4] = { ...lm[8], x: lm[8].x + 0.025 };
  if (kind === "band") lm[4] = { ...lm[8], x: lm[8].x + 0.105 };
  if (kind === "point") lm[8] = { x: x - 0.4, y: 0.64, z: 0 };
  return { landmarks: lm, label, confidence };
}
function setup() {
  const robot = new Controller(demoScene);
  return { robot, g: new GestureController(robot) };
}
function feed(
  g: GestureController,
  o: Observation[],
  start: number,
  end: number,
) {
  for (let t = start; t <= end; t += 50) g.process(o, t);
}
test("fixtures represent distinct open, pinch, fist and point geometry", () => {
  assert.equal(features(sample().landmarks).open, true);
  assert.ok(features(sample("pinch").landmarks).pinch < CONTROL.pinchClose);
  assert.equal(features(sample("fist").landmarks).fist, true);
  assert.ok(features(sample("point").landmarks).point);
});
test("a single palm frame cannot activate; stable palm activates after confirmation", () => {
  const { g } = setup();
  g.process([sample()], 100);
  assert.notEqual(g.tracks[1].state, "ARM_CONTROL");
  feed(g, [sample()], 150, 450);
  assert.equal(g.tracks[1].state, "ARM_CONTROL");
});
test("pinch and release require confirmation and retain hysteresis", () => {
  const { g, robot } = setup();
  feed(g, [sample()], 100, 500);
  g.process([sample("pinch")], 550);
  assert.equal(robot.arms[1].closed, false);
  feed(g, [sample("pinch")], 600, 1050);
  assert.equal(robot.arms[1].closed, true);
  feed(g, [sample("band")], 1100, 1650);
  assert.equal(robot.arms[1].closed, true);
  feed(g, [sample()], 1700, 2200);
  assert.equal(robot.arms[1].closed, false);
  assert.equal(g.tracks[1].state, "ARM_CONTROL");
});
test("fist immediately freezes accepted pose and preserves grip", () => {
  const { g, robot } = setup();
  feed(g, [sample()], 100, 500);
  feed(g, [sample("pinch")], 550, 1000);
  robot.arms[1].target = [0.6, 1.3, 0];
  g.process([sample("fist")], 1050);
  assert.equal(g.tracks[1].state, "HOLD");
  assert.deepEqual(robot.arms[1].target, robot.arms[1].end);
  assert.equal(robot.arms[1].closed, true);
});
test("low confidence and tracking loss hold; recovery needs a fresh palm confirmation", () => {
  const { g, robot } = setup();
  feed(g, [sample()], 100, 500);
  g.process([sample("open", 0.5, "Right", 0.3)], 550);
  assert.equal(g.tracks[1].state, "HOLD");
  assert.equal(g.tracks[1].stable, false);
  g.process([sample()], 600);
  assert.notEqual(g.tracks[1].state, "ARM_CONTROL");
  feed(g, [sample()], 650, 1000);
  g.process([], 1250);
  assert.equal(g.tracks[1].stable, false);
  assert.deepEqual(robot.arms[1].velocity, [0, 0, 0]);
});
test("tiny jitter stays inside dead zone, mirrored movement follows screen right", () => {
  const { g, robot } = setup();
  robot.controlRight = [-1, 0, 0];
  feed(g, [sample()], 100, 500);
  const p = [...robot.arms[1].target] as [number, number, number];
  feed(g, [sample("open", 0.501)], 550, 900);
  assert.ok(distance(p, robot.arms[1].target) < 0.001);
  feed(g, [sample("open", 0.44)], 950, 1350);
  assert.ok(robot.arms[1].target[0] < p[0] - 0.04);
});
test("hand identity survives reversed detection order and transient label flips", () => {
  const { g } = setup();
  feed(
    g,
    [sample("open", 0.25, "Left"), sample("pinch", 0.75, "Right")],
    100,
    500,
  );
  g.process(
    [sample("pinch", 0.74, "Left"), sample("open", 0.26, "Right")],
    550,
  );
  assert.ok(g.tracks[0].rawWrist!.x < 0.4);
  assert.ok(g.tracks[1].rawWrist!.x > 0.6);
});
test("two open palms recenter once and do not jump the arms", () => {
  const { g, robot } = setup();
  const before = robot.arms.map((a) => [...a.end]);
  feed(
    g,
    [sample("open", 0.25, "Left"), sample("open", 0.75, "Right")],
    100,
    1000,
  );
  assert.equal(g.message, "TRACKING RECENTERED");
  const first = g.lastRecenter;
  feed(
    g,
    [sample("open", 0.25, "Left"), sample("open", 0.75, "Right")],
    1050,
    3000,
  );
  assert.equal(g.lastRecenter, first);
  assert.deepEqual(
    robot.arms.map((a) => a.target),
    before,
  );
});
test("sustained pointing produces one bounded turn, not repeated rotations", () => {
  const { g, robot } = setup();
  feed(g, [sample("point")], 100, 2000);
  assert.ok(Math.abs(robot.rotationTarget) > 0);
  assert.ok(Math.abs(robot.rotationTarget) <= CONTROL.rotationStep + 1e-6);
  for (let i = 0; i < 180; i++) robot.tick(1 / 60);
  assert.ok(Math.abs(robot.bodyYaw) <= CONTROL.rotationStep + 1e-4);
  assert.ok(robot.arms.every((a) => a.status === "ACCEPTED"));
});
test("three-step calibration samples an open palm, pinch and release", () => {
  const { g } = setup();
  g.beginCalibration();
  feed(g, [sample()], 100, 1000);
  assert.equal(g.calibration?.stage, "pinch");
  feed(g, [sample("pinch")], 1050, 2100);
  assert.equal(g.calibration?.stage, "relax");
  feed(g, [sample()], 2150, 3200);
  assert.equal(g.calibration, null);
  assert.equal(g.calibrated, true);
  assert.ok(g.tracks[1].thresholds.release > g.tracks[1].thresholds.close);
});
