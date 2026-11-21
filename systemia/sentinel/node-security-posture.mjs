// Sanitized, read-only posture interpretation for explicitly owned Evercraft nodes.
// This module does not run commands, scan networks, change settings, or claim compliance.
const SSH_SERVICE_STATES = new Set(['active', 'inactive', 'unknown']);
const YES_NO = new Set(['yes', 'no', 'unknown']);
const ROOT_LOGIN = new Set(['yes', 'no', 'prohibit-password', 'without-password', 'forced-commands-only', 'unknown']);
const UFW_STATES = new Set(['active', 'inactive', 'unknown']);

function state(value, allowed) {
  return allowed.has(value) ? value : 'unknown';
}
function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 65535 ? value : null;
}
function check(id, status, detail) {
  return { id, status, detail };
}

export function evaluateNodeSecurityPosture(facts = {}) {
  const sshService = state(facts.ssh?.service, SSH_SERVICE_STATES);
  const password = state(facts.ssh?.password_authentication, YES_NO);
  const keyboard = state(facts.ssh?.kbd_interactive_authentication, YES_NO);
  const rootLogin = state(facts.ssh?.permit_root_login, ROOT_LOGIN);
  const ufw = state(facts.firewall?.ufw, UFW_STATES);
  const wildcard = count(facts.listeners?.wildcard);
  const loopback = count(facts.listeners?.loopback);
  const restricted = count(facts.listeners?.restricted);
  const unclassified = count(facts.listeners?.unclassified);
  const checks = [];

  if (sshService === 'active') {
    checks.push(check('ssh_password_authentication',
      password === 'yes' ? 'action_required' : password === 'no' ? 'observed_hardening' : 'unknown',
      password === 'yes' ? 'Password-based SSH is enabled; operator review and key-based migration required.' : 'Read-only effective SSH setting; network accessibility is not established.'));
    checks.push(check('ssh_keyboard_interactive',
      keyboard === 'yes' ? 'action_required' : keyboard === 'no' ? 'observed_hardening' : 'unknown',
      keyboard === 'yes' ? 'SSH keyboard-interactive authentication is enabled; review authentication policy.' : 'Read-only effective SSH setting; no authentication attempt was made.'));
    checks.push(check('ssh_root_login',
      rootLogin === 'yes' ? 'action_required' : rootLogin === 'no' ? 'observed_hardening' : rootLogin === 'unknown' ? 'unknown' : 'review',
      'Effective root SSH login policy; review scope before altering access.'));
  } else {
    checks.push(check('ssh_authentication', 'unknown',
      sshService === 'inactive' ? 'Inspected SSH services were inactive; socket activation and other access paths not excluded.' : 'SSH service state unavailable.'));
  }

  checks.push(check('listener_bindings',
    wildcard === null ? 'unknown' : wildcard > 0 ? 'review' : 'observed_hardening',
    wildcard === null
      ? 'Listening sockets could not be read.'
      : wildcard > 0
        ? 'Wildcard-bound TCP listeners observed; this alone does not prove Internet reachability.'
        : 'No wildcard TCP listeners observed at collection time; UDP and external reachability not assessed.'));

  checks.push(check('firewall',
    ufw === 'active' ? 'review' : ufw === 'inactive' ? 'review' : 'unknown',
    ufw === 'active'
      ? 'UFW reports active; effective rules and upstream access controls remain unverified.'
      : ufw === 'inactive'
        ? 'UFW reports inactive; other host or upstream firewall controls may exist.'
        : 'Firewall state not established by this unprivileged inspection.'));

  checks.push(check('patch_freshness', 'unknown', 'Software patch freshness was not independently checked.'));
  checks.push(check('backup_restoration', 'unknown', 'No supervised backup restoration evidence was collected.'));
  checks.push(check('external_path_verification', 'unknown',
    'No external network path, router rule, DNS, or public service exposure was probed.'));

  return {
    schema: 'systemia.sentinel.node-security-posture.v1',
    evaluated_at: new Date().toISOString(),
    confidence: 'local_read_only_observation',
    protection_verified: false,
    disposition: checks.some((row) => row.status === 'action_required') ? 'action_required' : 'needs_operator_review',
    checks,
    listener_summary: {
      wildcard,
      loopback,
      restricted,
      unclassified
    },
    sensitive_values_emitted: false,
    remediation_executed: false,
    next_gate: 'authorized_operator_review_and_independent_recovery_proof'
  };
}
