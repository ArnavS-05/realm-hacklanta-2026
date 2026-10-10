# REALM
**Turn Reality Into a Robotics Playground.**

## Short description
REALM turns real environments into interactive robot simulations. Upload a photo, let Gemini understand the workspace, then use your own body and hand gestures through a webcam to embody and teleoperate a virtual humanoid inside its digital twin.

## Inspiration
A robotics lab should begin with curiosity, not a hardware purchase. We wanted to make the objects already around us part of an embodied experiment: your desk becomes the world, and your hands become the controller.

## What it does
REALM connects scene understanding, human motion and robotic manipulation. Gemini analyzes a workspace photograph into a semantic scene graph. The environment becomes simple interactive geometry. Local computer vision maps hand movement and pinch gestures to a humanoid-inspired robot with constrained arms. You can grasp, carry and release objects, compare the photograph with its digital twin, and ask Gemini for a high-level mission plan or a brief explanation of a motion checkpoint.

A labeled offline workbench and fixed mission script keep the experience demonstrable when cloud services are unavailable. Gemini features require a configured API key; never describe the offline script as AI reasoning.

## How we built it
React and Three.js render the experience, Rapier simulates released objects, and MediaPipe detects hands and pose locally. An analytic inverse-kinematics controller validates reach, joint angles, speed and swept obstacle boundaries. Gemini runs behind server endpoints with structured output and runtime validation. It proposes intent-level actions; deterministic code executes them.

## Challenges
Monocular images do not provide reliable metric depth, so we build a semantic digital twin using estimated dimensions instead of claiming photogrammetry. Palm-size depth control is intentionally simple and needs calibration. Ghost targets expose invalid requests before execution. The humanoid stays on a fixed base so the manipulation loop remains the focus.

## Accomplishment
One coherent interaction loop: a real object becomes a manipulation target, a human gesture becomes constrained robotic motion, and an AI plan becomes inspectable steps. The interface invites participation rather than requiring robotics expertise.

## What we learned
The boundary between perception, reasoning and control matters. AI can explain and plan, but geometry and constraints need deterministic checks. A graceful offline mode also makes a live demonstration far more dependable.

## What's next
Metric scene calibration, worker-based vision inference, richer collision checking, obstacle-aware trajectories and eventual hardware-in-the-loop experiments.

## Built with
TypeScript, React, Vite, Three.js, React Three Fiber, Rapier, MediaPipe, Gemini API, Google GenAI SDK, Tailwind CSS, Framer Motion, Express, Vercel.

## Requested challenge targets
- Mercedes-Benz: Best Application of Computer Vision — local hand/pose vision, gesture recognition, image grounding and human–robot interaction.
- MLH: Best Use of Gemini API — structured scene perception, goal planning and checkpoint explanations.
- Adobe Creative — a visual, embodied interaction with a reality-to-simulation narrative. No Adobe API integration is claimed.

Confirm official categories and eligibility with the event before selecting them. Verify a live Gemini request and record an actual hand-controlled pickup before submitting. Do not claim those untested demonstrations from this draft alone.

## AI assistance disclosure
AI assistance was used to design and implement the code, documentation and demonstration materials. Team members must review the implementation and adapt this disclosure to the event's rules. Gemini is also a runtime component of the product, distinct from development assistance.
