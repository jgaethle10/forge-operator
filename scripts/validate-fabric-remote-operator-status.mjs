// Strict, fail-closed validation for an independently authenticated status-only probe.
// This is not a work authorization or a device enrollment attestation.
const PROGRAMS = new Set(['git', 'npm', 'systemctl', 'journalctl']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (reason) => ({valid: false, reason});

export function validateRemoteOperatorStatus(status) {
  if (!isRecord(status)) return fail('response_not_object');
  if (status.ok !== true || status.schema !== 'evercraft.remote-operator.status.v1') return fail('unexpected_status_schema');
  if (typeof status.instance_id !== 'string' || status.instance_id.length < 1 || status.instance_id.length > 256) return fail('invalid_instance_id');
  if (!Array.isArray(status.roots) || status.roots.length === 0 ||
      status.roots.some((x) => typeof x !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(x))) return fail('invalid_admitted_roots');
  if (!isRecord(status.filesystem) || status.filesystem.sensitive_path_read_block !== true) return fail('sensitive_path_guard_missing');
  if (!isRecord(status.execution) || status.execution.mode !== 'bounded-program' ||
      status.execution.interactive_tty !== false || status.execution.root_privilege !== false ||
      status.execution.ambient_secret_environment_forwarded !== false) return fail('unbounded_execution_posture');
  if (!Array.isArray(status.execution.programs) || status.execution.programs.length === 0 ||
      status.execution.programs.some((p) => typeof p !== 'string' || !PROGRAMS.has(p)) ||
      new Set(status.execution.programs).size !== status.execution.programs.length) return fail('unsafe_execution_programs');
  if (status.receipt_semantics !== 'hashes_and_metadata_only') return fail('unsafe_receipt_semantics');
  return {valid: true, reason: 'valid_bounded_remote_operator_status'};
}
