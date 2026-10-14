# Evercraft Embodied AI RC002 | Simulation-only goal adapter

**Lineage:** existing Systemia mission `evercraft-thorn-hunt-and-robotics-fabric-20261009`. This is a research increment under **EarthWorks Autonomy**, not a new control plane, new app, Saban dispatch, or production release.

## Verified scope

- Adds `embodied-goal-simulator.mjs`, which consumes strictly structured hypothetical LLM goal outputs and calls the existing EarthWorks `makeSimulatorAdapter('mobile_robot')` registry authorization path.
- The only accepted modes are `simulation` with a matching robot ID, and only `goto` and `stop` goals. Other commands, raw motor fields, arbitrary Python/JS, invalid numbers, duplicates, out-of-bounds goals, and physical authority are rejected.
- A deterministic *simulated* motion step enforces an explicit sensor observation, lease age, obstacle clearance, human hold, synthetic emergency stop, angular speed, and movement bounds; expiry clears the goal.
- Receipts are hash-chained locally, offering accidental-tamper detection but **not cryptographic authentication, durable evidence custody, signed hardware telemetry, or adversarial tamper resistance**.
- No LLM, ASR, camera, ROS 2, Gazebo, robot SDK, machine, physical actuator, real watchdog, or human-safety-rated circuit is connected.
- The existing EarthWorks workflow automatically runs Node test files added in this folder on PR/push. Local pre-push verification: `node --test systemia/earthworks-autonomy/embodied-goal-simulator.test.mjs` with 17/17 passing. GitHub Actions must verify independently.

## Reproduce

```bash
node --test systemia/earthworks-autonomy/embodied-goal-simulator.test.mjs
```

Example of an accepted *simulation-only* planner goal:

```json
{
  "schema": "evercraft.embodied.goal.v1",
  "request_id": "example-001",
  "kind": "goto",
  "target_x_m": 0.3,
  "target_y_m": 0,
  "speed_mps": 0.1
}
```

The caller must explicitly provide authority context `{authority_state:'simulation',robot_id:'sim.robot.001'}` plus a fresh synthetic observation. No string prompt or text inference is executed by this code.

## Next gates: NOT COMPLETE

1. **Systemia:** canonical dedupe/admission and reviewer receipts before assigning team work.
2. **Saban:** benchmark actual authorized-node STT and local LLM inference, recording RAM, p50/p95 latency, false-action and fail-closed rates; Node002 signed shadow heartbeat is not an execution lease.
3. **Robotics:** add an offline Gazebo/ROS2 test bridge that translates intent only into simulator goals. Compare independent controller results against this minimal 2D reference.
4. **Perception:** ground timestamps, camera calibration, geometry/depth, ambiguous/human detection, and known-failure cases; never treat YOLO detections as reliable obstacle distances.
5. **Security/QA:** test prompt injection, forged sensor data, untrusted authority context, sensor dropouts, robot identity mismatch, goal replay, signing and evidence custody.
6. **University:** store reproducible lesson, baseline, adversarial retest and actual observed results, not competency without independent verification.

## Sources and limitations

- WirePod: https://github.com/kercre123/wire-pod
- Vector Python SDK: https://github.com/anki/vector-python-sdk
- Local STT: https://github.com/ggml-org/whisper.cpp
- Local model inference: https://github.com/ggml-org/llama.cpp
- ROS2 Nav2: https://docs.nav2.org/
- Gazebo/ros2_control: https://control.ros.org/
- LeRobot: https://huggingface.co/docs/lerobot/index

The prototype is a deterministic educational simulator. Its numerical limits do **not** constitute a safety rating or authorization for motors. Do not attach the return values to physical equipment or remove existing EarthWorks, Yard, Saban, or Systemia authorization boundaries.
