# REALM · 60–90 second demonstration

## Before judging
Open the deployed HTTPS app in Chrome or Edge. Verify Gemini status, camera permissions, model initialization, lighting, both hands and the bottle target. Perform one real pickup. Use a simple, well-lit tabletop photo with a bottle and cup. Keep the offline demo ready. Do not imply a fallback image was analyzed live.

| Time | Action and narration |
| --- | --- |
| 0–10 s | Landing page: “This is REALM. Instead of controlling a robot with a keyboard, you become the robot.” |
| 10–20 s | Upload the prepared workspace photo. Analyze environment. “Gemini identifies objects, support surfaces and spatial relationships.” |
| 20–30 s | Open Split view; click a bottle region. “That real bottle is now an interactive object in our semantic digital twin.” |
| 30–45 s | Enable vision, hold neutral hands, calibrate, move slowly. “Computer vision stays local. My hand sets a target; the ghost previews it; inverse kinematics validates the robot's motion.” |
| 45–60 s | Reach bottle, pinch, move, release beside cup. “Pinch to grasp. Release to return the object to physics.” |
| 60–70 s | Show velocity, joints and constraints. “This arm has reach and speed limits. Invalid targets are blocked, not animated through obstacles.” |
| 70–80 s | AI assist; request bottle beside cup. Show the returned plan. “Gemini handles intent. Deterministic robotics handles execution.” |
| 80–90 s | Show completion or execute the reviewed plan. “REALM turns a physical environment into an embodied robotics lab using computer vision, simulation and Gemini.” |

## Offline version
Say: “The cloud is unavailable, so this is our bundled demo scene and fixed demonstration plan.” Click Load Demo Realm, AI Assist, Load offline demo plan, Execute validated plan. Show the pickup, placement and measured result. Do not promise Gemini analysis while it is unconfigured.

## Camera fallback
Say: “Camera permission isn't available on this device. The same constrained controller also has a pointer fallback.” Show pointer controls: arrows move X/Y, Q/E changes depth, G closes/releases, Space stops. Prefer the offline plan for a time-limited presentation.

## Likely questions
**Is this photogrammetry?** No. Gemini provides semantic objects and approximate relationships; primitives make the environment manipulable.

**Does Gemini control the motors?** No. It returns high-level steps. Local deterministic code validates every motion update.

**Does video leave the laptop?** Live tracking stays local. Only a selected photo is uploaded when the operator explicitly requests analysis.

**Is it a physical humanoid model?** It is a simplified fixed-base humanoid-inspired model with kinematic arms and physics-backed object release, not an industrial dynamics or safety-certified controller.
