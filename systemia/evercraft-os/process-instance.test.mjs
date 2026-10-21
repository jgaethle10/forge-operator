import test from "node:test";
import assert from "node:assert/strict";
import { captureCurrentProcessInstance, observeProcessInstance } from "./process-instance.mjs";

test("Linux process-instance capture round-trips to the exact current process", { skip: process.platform !== "linux" }, () => {
  const captured = captureCurrentProcessInstance();
  assert.equal(captured.schema, "evercraft.os.process-instance.v1");
  assert.equal(captured.platform, "linux");
  assert.equal(captured.pid, process.pid);
  assert.match(captured.boot_id, /^[0-9a-f-]+$/i);
  assert.match(captured.proc_start_ticks, /^\d+$/);
  const observed = observeProcessInstance(captured);
  assert.equal(observed.state, "same_process_alive");
  assert.equal(observed.same_process_instance, true);
});

test("Linux process-instance observation distinguishes PID reuse from the original writer", { skip: process.platform !== "linux" }, () => {
  const captured = captureCurrentProcessInstance();
  const observed = observeProcessInstance({ ...captured, proc_start_ticks: String(BigInt(captured.proc_start_ticks) + 1n) });
  assert.equal(observed.state, "pid_reused");
  assert.equal(observed.same_process_instance, false);
});

test("Linux process-instance observation treats boot-id change as a different process universe", { skip: process.platform !== "linux" }, () => {
  const captured = captureCurrentProcessInstance();
  const observed = observeProcessInstance({ ...captured, boot_id: "00000000-0000-0000-0000-000000000000" });
  assert.equal(observed.state, "boot_changed");
  assert.equal(observed.same_process_instance, false);
});

test("malformed process identity is held rather than guessed", () => {
  const observed = observeProcessInstance({ schema: "not-evercraft" });
  assert.equal(observed.state, "held");
  assert.equal(observed.same_process_instance, null);
  assert.match(observed.reason, /evidence_missing_or_invalid/);
});
