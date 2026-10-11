# Release verification — October 11, 2026

Live product: https://realm-hacklanta-2026.vercel.app/
Source: https://github.com/ArnavS-05/realm-hacklanta-2026

## Verified

- TypeScript checking and Vite production build pass. The 3D/physics chunk produces a size advisory; it is lazy-loaded.
- 20 automated tests cover inverse kinematics, reach and joint constraints, swept obstacle collision, velocity limits, complete pick/carry/release, schema validation, and safe API failure without credentials.
- Synthetic landmark tests cover gesture timing, pinch/release hysteresis, immediate fist hold, confidence loss, dead zone, mirrored motion, identity association, one-shot rotation/recenter, calibration, and AI/manual command ownership.
- Production browser: offline plan completed pickup and placement beside the cup, showing zero blocked collisions and zero joint/reach events. Mission completion, reset, emergency stop/resume and the missing-Gemini-key message were observed.
- Fresh production browser reported no JavaScript errors during the mission. Desktop and 390-pixel mobile layouts were visually inspected; mobile had no horizontal overflow. Mobile layout inspection does not establish mobile camera performance.
- Production `/api/health` returned `ok: true`, `geminiConfigured: false`.

## Requires operator verification

- No Gemini key was supplied. Real scene analysis, model access, AI planning and explanation are implemented but have not been tested against a credential-backed response. Set `GEMINI_API_KEY` in Vercel's project environment variables and redeploy, or in local `.env`.
- Actual webcam gesture accuracy, calibration ergonomics, hand occlusion and camera-dependent latency have not been verified. Browser camera permission did not complete in the available test environment. Run the open-palm → move → pinch → move → release sequence in Chrome or Edge with a real camera before presenting.
- Photo reconstruction is an approximate semantic scene, not metric reconstruction. Robot arms are constrained kinematic models with analytic IK; this is not a certified physical robot controller. Full self-collision, locomotion and dynamic articulated joints are outside this release.
- Effort and score are simulation estimates. Offline plans are explicitly labeled scripted, not AI-generated.

## Fast demo

1. Open the live URL and select **Explore the demo**.
2. Select **AI assist → Load offline demo plan → Execute validated plan**.
3. For manual control, select **Manual teleop**, enable the camera and complete **Calibrate hands**. The pointer/keyboard controls provide a camera-free alternative.

See `GESTURE_CONTROL.md` for timings, calibration and tuning, and `DEMO_SCRIPT.md` for the presentation walkthrough.
