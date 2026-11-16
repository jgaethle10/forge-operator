# Evercraft Embodied AI RC002 | Simulation-only goal adapter

**Lineage:** existing Systemia mission `evercraft-thorn-hunt-and-robotics-fabric-20261009`. This is a research increment under **EarthWorks Autonomy**, not a new control plane, new app, Saban dispatch, or production release.

## Verified scope

- Adds `embodied-goal-simulator.mjs`, which consumes strictly structured hypothetical LLM goal outputs and calls the existing EarthWorks `makeSimulatorAdapter('mobile_robot')` registry authorization path.
- The only accepted modes are `simulation` with a matching robot ID, and only `goto` and `stop` goals. Other commands, raw motor fields, arbitrary Python/JS, invalid numbers, duplicates, out-of-bounds goals, and physical authority are rejected.
- A deterministic *simulated* motion step enforces an explicit sensor observation, lease age, obstacle clearance, human hold, synthetic emergency stop, angular speed, and movement bounds; expiry clears the goal.
- Receipts are hash-chained locally, offering accidental-tamper detection but **not cryptographic authentication, durable evidence custody, signed hardware telemetry, or adversarial tamper resistance**.
- No LLM, ASR, camera, ROS 2, Gazebo, robot SDK, machine, physical actuator, real watchdog, or human-safety-rated circuit is connected.
- The existing EarthWorks workflow automatically runs Node test files added in this folder on PR/push. Local pre-push verification: `node --test systemia/earthworks-autonomy/embodied-goal-simulator.test.mjs systemia/earthworks-autonomy/local-planner-goal-adapter.test.mjs` with 29/29 passing across two suites. GitHub Actions must verify independently.

## Reproduce

```bash
node --test systemia/earthworks-autonomy/*.test.mjs
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

## Offline local-model response boundary

`local-planner-goal-adapter.mjs` accepts up to 1,024 UTF-8 bytes of plain JSON from a hypothetical locally hosted model, requires the exact `evercraft.embodied.goal.v1` schema and sends the parsed proposal only to a real `EmbodiedGoalSimulator` instance. Text never supplies its own authority context. No HTTP request, model inference or robot connection is included. The companion test file adds 12 fail-closed cases; total local unit tests and updated GitHub EarthWorks Autonomy proof checks are 29/29 green, run 38655208645.

## RC003 localhost model probe and benchmark (opt-in, simulation only)

The next increment adds `local-llm-simulation-probe.mjs`, a narrow OpenAI-compatible `/v1/chat/completions` HTTP client for a model server running **on the same machine**, plus `local-llm-benchmark-cli.mjs`. It never tries to execute a motor command or a shell/tool call from the model. The only allowed URL is `http://127.0.0.1:PORT/v1/chat/completions` or `http://[::1]:PORT/v1/chat/completions`, where the numeric port is specified explicitly. Localhost hostname aliases, remote hosts, credentials, redirects and other endpoint paths are rejected. The returned JSON is bounded to 16 KiB, the model output to 1 KiB, and the action schema to exactly `goto` or `stop` with fixed numeric limits. The trusted request ID must match the model response.

**Opt-in command, only on an operator-authorized device with a pre-existing loopback-compatible inference server:**

```bash
node systemia/earthworks-autonomy/local-llm-benchmark-cli.mjs \
  --live-local-inference \
  --endpoint=http://127.0.0.1:8080/v1/chat/completions \
  --model=YOUR_LOCAL_MODEL_NAME \
  --intent="Navigate to x=0.25m y=0m within the synthetic map" \
  --runs=3 \
  --expect-kind=goto
```

This command makes network requests **only to the specified loopback server**. It does not install or start a model, grant Saban/Node002 execution authority, advance the simulated motion clock, or command any real hardware. It creates fresh synthetic observations and simulator instances per inference sample, and emits accepted/rejected counts, p50/p95 inference latency, classified proposed goal kinds, label mismatches and sanitized failure codes. `--expect-kind=stop` is useful for deliberately ambiguous/unsafe test phrases. A successful benchmark is **not** proof of real perception quality, general physical autonomy, authenticated machine identity, safety certification, or Saban production execution.

**Offline tests (no real LLM required):**

```bash
node --test systemia/earthworks-autonomy/*.test.mjs
```

These tests include adversarial fake HTTP responses and a real, ephemeral 127.0.0.1 HTTP server that proves transport and redirect denial without model inference. Their independent GitHub Actions results must be checked on the *latest* PR head. **Do not interpret mock HTTP tests as evidence of an actual model.**

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
