# Precise gesture control

The control loop is entirely local:

**Webcam → MediaPipe → identity association → smoothed landmarks → state machine → calibrated retargeting → IK → mechanical checks → robot.**

Gemini Robotics ER 2 is the default server-side scene and task reasoning model. It is not involved in this loop. Its official model ID is `gemini-robotics-er-2-preview`; availability depends on the configured Google project. [Google model documentation](https://ai.google.dev/gemini-api/docs/robotics-overview).

## Operator flow
1. Enable camera in a camera-enabled browser on HTTPS or localhost.
2. Click **Calibrate hands**. Show one open palm, touch thumb to index while the other fingers stay loose, then release and relax. Each sample stage needs about 650 ms of stable input; movement between stages adds time.
3. Hold an open palm for 300 ms to engage an arm.
4. Move slowly toward the bottle. Preview and robot motion share the same IK model.
5. Pinch for 260 ms to close the gripper. The closest valid object within the grasp region is attached without snapping its center to the hand.
6. Move the hand, then separate thumb and index for 260 ms to release.

## Small gesture set
| Gesture | Result | Protection |
| --- | --- | --- |
| Open palm | Arm control | 300 ms confirmation |
| Pinch | Close/grasp | Palm-normalized tip distance, confirmation, cooldown |
| Release pinch | Open/drop | Separate higher threshold, confirmation, cooldown |
| Fist | Immediate arm hold | Preserves current grip and accepted pose |
| Point left/right | One 15° body turn | Confirmation, latch until gesture changes, cooldown; no turning with payload |
| Two open palms | Recenter tracking | 650 ms hold, one-shot latch and cooldown |

Recenter re-anchors neutral hand coordinates to the robot's current accepted pose. It does not teleport the robot or drop a payload. Open-palm confirmation re-engages control afterward. Body turns stop at ±45° and are checked against reach and collision bounds. There is no gesture-based walking.

## Reliability layer
- Time-aware exponential landmark filtering (65 ms time constant).
- 8 mm robot-target dead zone; genuine accumulated movement still passes it.
- Hand identity confidence gates: 0.8 enter / 0.65 retain. MediaPipe detection/presence gates are additionally set to 0.7. Hand percentages in the UI are handedness scores, not a calibrated detection probability.
- Pose telemetry requires landmark visibility at least 0.65; hand control does not depend on unreliable body-pose data.
- Wrist proximity plus handedness associates left/right across frame-order changes. Ambiguous crossings are held instead of guessed. Missing tracking freezes after 180 ms; confidence failures freeze immediately. Recovery requires an open palm.
- Pinch defaults: close below 0.35 palm widths; release above 0.58. Calibration estimates individualized thresholds; they remain distinct.
- Camera-space horizontal/forward bases keep controls aligned with the mirrored preview and current 3D view. Depth is relative palm scale, not measured depth.
- Open, grip, hold, turn and recenter are explicit states. Turn gestures cannot simultaneously retarget the hand; fist wins immediately.

All tuning is in `src/controlConfig.ts`. Interpretation is in `src/gestures.ts`; browser capture/rendering is in `src/Vision.tsx`. Tests replay synthetic landmark sequences to check temporal behavior deterministically. Synthetic tests do not prove accuracy on an unseen person's live webcam.

## Recovery
- Fist: hold the corresponding arm.
- Space: global emergency stop; click Resume afterward.
- Two palms: reset the tracking reference.
- Reset robot: restore the robot without restoring object positions.
- Reset realm: restore the entire scene.
- Pointer/keyboard: arrows for target X/Y, Q/E for depth, G for gripper, A/D for bounded turning.

For best results keep the palm and fingers visible, avoid backlighting and fast crossings, and use the three-step calibration before the judged demonstration.
