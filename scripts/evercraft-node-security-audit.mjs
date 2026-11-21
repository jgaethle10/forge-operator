#!/usr/bin/env node
// Run locally on Evercraft-owned Linux systems. No sudo, shell, network access,
// controller commands, configuration writes, or raw-address logging.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateNodeSecurityPosture } from '../systemia/sentinel/node-security-posture.mjs';

function readOnlyCommand(binary, args) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8', timeout: 2500, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.error || result.signal) return null;
  return { status: result.status, output: String(result.stdout || '') };
}

export function summarizeListeningTcp(raw) {
  if (typeof raw !== 'string') {
    return { wildcard: null, loopback: null, restricted: null, unclassified: null };
  }
  const counts = { wildcard: 0, loopback: 0, restricted: 0, unclassified: 0 };
  for (const line of raw.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== 'LISTEN' || fields.length < 5) continue;
    const address = fields[3];
    const colon = address.lastIndexOf(':');
    if (colon < 0) { counts.unclassified++; continue; }
    const host = address.slice(0, colon).replace(/^\[|\]$/g, '').toLowerCase();
    if (['*', '0.0.0.0', '::'].includes(host)) counts.wildcard++;
    else if (host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)) counts.loopback++;
    else counts.restricted++;
  }
  return counts;
}

export function parseEffectiveSshd(raw) {
  if (typeof raw !== 'string') return {};
  const allowed = new Set(['passwordauthentication', 'kbdinteractiveauthentication', 'permitrootlogin']);
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-z]+)\s+([^\s]+)/);
    if (!match || !allowed.has(match[1])) continue;
    values[match[1]] = match[2].toLowerCase();
  }
  return {
    password_authentication: values.passwordauthentication || 'unknown',
    kbd_interactive_authentication: values.kbdinteractiveauthentication || 'unknown',
    permit_root_login: values.permitrootlogin || 'unknown'
  };
}

export function parseUfwState(raw) {
  if (typeof raw !== 'string') return 'unknown';
  const match = raw.match(/^Status:\s+(active|inactive)\s*$/im);
  return match ? match[1].toLowerCase() : 'unknown';
}

export function inspectLocalNode() {
  const listening = readOnlyCommand('ss', ['-H', '-ltn']);
  const socketSummary = listening?.status === 0
    ? summarizeListeningTcp(listening.output) : summarizeListeningTcp(null);
  const serviceRows = ['ssh.service', 'sshd.service', 'ssh.socket', 'sshd.socket']
    .map((unit) => readOnlyCommand('systemctl', ['is-active', unit]))
    .filter(Boolean)
    .map((row) => row.output.trim().toLowerCase());
  const sshService = serviceRows.includes('active') ? 'active'
    : serviceRows.some((row) => row === 'inactive' || row === 'failed') ? 'inactive'
    : 'unknown';

  let sshConfig = {};
  for (const binary of ['/usr/sbin/sshd', '/sbin/sshd', 'sshd']) {
    const response = readOnlyCommand(binary, ['-T']);
    if (response?.status !== 0) continue;
    sshConfig = parseEffectiveSshd(response.output);
    break;
  }

  const ufw = readOnlyCommand('ufw', ['status']);
  return evaluateNodeSecurityPosture({
    ssh: { service: sshService, ...sshConfig },
    listeners: socketSummary,
    firewall: { ufw: ufw?.status === 0 ? parseUfwState(ufw.output) : 'unknown' }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(inspectLocalNode(), null, 2));
}
