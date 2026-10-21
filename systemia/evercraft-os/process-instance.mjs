import fs from "node:fs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function integer(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(field + "_invalid");
  return number;
}

function readBootId() {
  return required(fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(), "process_boot_id");
}

function readProcStartTicks(pid) {
  const text = fs.readFileSync(`/proc/${integer(pid, "process_pid")}/stat`, "utf8").trim();
  const close = text.lastIndexOf(")");
  if (close < 0) throw new Error("process_stat_invalid");
  const tail = text.slice(close + 1).trim().split(/\s+/);
  // /proc/<pid>/stat fields after comm begin at field 3. starttime is field 22.
  const startTicks = tail[19];
  if (!/^\d+$/.test(String(startTicks ?? ""))) throw new Error("process_start_ticks_invalid");
  return String(startTicks);
}

export function captureCurrentProcessInstance({ pid = process.pid } = {}) {
  if (process.platform !== "linux") {
    throw new Error("process_instance_linux_required");
  }
  return {
    schema: "evercraft.os.process-instance.v1",
    platform: "linux",
    pid: integer(pid, "process_pid"),
    boot_id: readBootId(),
    proc_start_ticks: readProcStartTicks(pid),
  };
}

export function observeProcessInstance(expected) {
  if (!expected || expected.schema !== "evercraft.os.process-instance.v1") {
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "held",
      same_process_instance: null,
      reason: "process_instance_evidence_missing_or_invalid",
      mutation_performed: false,
    };
  }
  if (expected.platform !== "linux" || process.platform !== "linux") {
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "held",
      same_process_instance: null,
      reason: "process_instance_linux_required",
      mutation_performed: false,
    };
  }

  let bootId;
  try {
    bootId = readBootId();
  } catch (error) {
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "held",
      same_process_instance: null,
      reason: String(error?.message || error),
      mutation_performed: false,
    };
  }

  if (bootId !== expected.boot_id) {
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "boot_changed",
      same_process_instance: false,
      pid: expected.pid,
      expected_boot_id: expected.boot_id,
      observed_boot_id: bootId,
      mutation_performed: false,
    };
  }

  try {
    const observedStartTicks = readProcStartTicks(expected.pid);
    if (observedStartTicks === expected.proc_start_ticks) {
      return {
        schema: "evercraft.os.process-instance-observation.v1",
        state: "same_process_alive",
        same_process_instance: true,
        pid: expected.pid,
        boot_id: bootId,
        expected_proc_start_ticks: expected.proc_start_ticks,
        observed_proc_start_ticks: observedStartTicks,
        mutation_performed: false,
      };
    }
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "pid_reused",
      same_process_instance: false,
      pid: expected.pid,
      boot_id: bootId,
      expected_proc_start_ticks: expected.proc_start_ticks,
      observed_proc_start_ticks: observedStartTicks,
      mutation_performed: false,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        schema: "evercraft.os.process-instance-observation.v1",
        state: "process_absent",
        same_process_instance: false,
        pid: expected.pid,
        boot_id: bootId,
        mutation_performed: false,
      };
    }
    return {
      schema: "evercraft.os.process-instance-observation.v1",
      state: "held",
      same_process_instance: null,
      pid: expected.pid,
      boot_id: bootId,
      reason: String(error?.message || error),
      mutation_performed: false,
    };
  }
}
