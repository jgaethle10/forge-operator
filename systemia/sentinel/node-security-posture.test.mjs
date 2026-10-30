import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNodeSecurityPosture } from './node-security-posture.mjs';
import { summarizeListeningTcp, parseEffectiveSshd, parseUfwState } from '../../scripts/evercraft-node-security-audit.mjs';

test('unknown security state never qualifies as protection', () => {
  const result = evaluateNodeSecurityPosture({});
  assert.equal(result.protection_verified, false);
  assert.equal(result.disposition, 'needs_operator_review');
  assert.equal(result.checks.find((x) => x.id === 'listener_bindings').status, 'unknown');
  assert.equal(result.checks.find((x) => x.id === 'backup_restoration').status, 'unknown');
});

test('SSH password and keyboard-interactive authentication create actionable findings', () => {
  const result = evaluateNodeSecurityPosture({
    ssh: { service: 'active', password_authentication: 'yes', kbd_interactive_authentication: 'yes', permit_root_login: 'no' },
    listeners: { wildcard: 0, loopback: 2, restricted: 0, unclassified: 0 },
    firewall: { ufw: 'active' }
  });
  assert.equal(result.disposition, 'action_required');
  assert.deepEqual(result.checks.filter((c) => c.status === 'action_required').map((c) => c.id),
    ['ssh_password_authentication', 'ssh_keyboard_interactive']);
  assert.equal(result.protection_verified, false);
});

test('root SSH login yes requires action; prohibit-password still needs review', () => {
  for (const [value, expected] of [['yes','action_required'], ['no','observed_hardening'],
      ['prohibit-password','review'], ['without-password','review']]) {
    const result = evaluateNodeSecurityPosture({
      ssh: { service: 'active', password_authentication: 'no', kbd_interactive_authentication: 'no', permit_root_login: value }
    });
    assert.equal(result.checks.find((c) => c.id === 'ssh_root_login').status, expected);
  }
});

test('inactive SSH services do not prove socket activation or other remote entry absent', () => {
  const result = evaluateNodeSecurityPosture({ ssh: { service: 'inactive' }, listeners: { wildcard: 0 } });
  assert.equal(result.checks.find((c) => c.id === 'ssh_authentication').status, 'unknown');
  assert.equal(result.protection_verified, false);
});

test('wildcard listeners are review indicators, not proof of a publicly reachable port', () => {
  const result = evaluateNodeSecurityPosture({ listeners: { wildcard: 2, loopback: 1, restricted: 1, unclassified: 0 } });
  const finding = result.checks.find((c) => c.id === 'listener_bindings');
  assert.equal(finding.status, 'review');
  assert.match(finding.detail, /does not prove Internet reachability/);
  assert.equal(JSON.stringify(result).includes('0.0.0.0'), false);
  assert.equal(JSON.stringify(result).includes(':22'), false);
});

test('firewall reporting does not certify enforcement or upstream routing', () => {
  for (const ufw of ['active', 'inactive', 'unknown']) {
    const result = evaluateNodeSecurityPosture({ firewall: { ufw } });
    assert.notEqual(result.checks.find((c) => c.id === 'firewall').status, 'observed_hardening');
  }
});

test('ss parser aggregates bind classes and never returns addresses or ports', () => {
  const summary = summarizeListeningTcp([
    'LISTEN 0 128 0.0.0.0:22 0.0.0.0:*',
    'LISTEN 0 128 [::]:8080 [::]:*',
    'LISTEN 0 128 127.0.0.1:8797 0.0.0.0:*',
    'LISTEN 0 128 [::1]:631 [::]:*',
    'LISTEN 0 128 192.0.2.10:443 0.0.0.0:*',
    'LISTEN 0 128 *:3000 *:*',
    'NOTLISTEN 0 128 0.0.0.0:9999 0.0.0.0:*'
  ].join('\n'));
  assert.deepEqual(summary, { wildcard: 3, loopback: 2, restricted: 1, unclassified: 0 });
  assert.equal(JSON.stringify(summary).includes('192.0.2.10'), false);
  assert.deepEqual(summarizeListeningTcp(null), {
    wildcard: null, loopback: null, restricted: null, unclassified: null
  });
});

test('effective sshd settings parser extracts only selected keys', () => {
  assert.deepEqual(parseEffectiveSshd([
    'passwordauthentication no',
    'kbdinteractiveauthentication yes',
    'permitrootlogin prohibit-password',
    'hostkey /etc/ssh/ssh_host_ed25519_key',
    'banner /private/sensitive/path'
  ].join('\n')), {
    password_authentication: 'no',
    kbd_interactive_authentication: 'yes',
    permit_root_login: 'prohibit-password'
  });
  assert.deepEqual(parseEffectiveSshd(null), {});
});

test('UFW parser recognizes limited status only and never infers firewall from noise', () => {
  assert.equal(parseUfwState('Status: active\n'), 'active');
  assert.equal(parseUfwState('Status: inactive\n'), 'inactive');
  assert.equal(parseUfwState('rules inaccessible'), 'unknown');
});

test('posture report omits arbitrary host details and never performs remediation', () => {
  const result = evaluateNodeSecurityPosture({
    hostname: 'sensitive-hostname',
    router_ip: '192.0.2.4',
    credentials: 'secret-placeholder',
    ssh: { service: 'unknown' },
    listeners: { wildcard: 0, loopback: 1, restricted: 0, unclassified: 0 }
  });
  const body = JSON.stringify(result);
  for (const forbidden of ['sensitive-hostname','192.0.2.4','secret-placeholder']) {
    assert.equal(body.includes(forbidden), false);
  }
  assert.equal(result.remediation_executed, false);
  assert.equal(result.sensitive_values_emitted, false);
});
