#!/usr/bin/env node
// Read-only, fail-closed Evercraft Network Guardian incident classifier.
// Does not contact, modify, or authenticate to the router.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const OWNED_WEB = [
  { external: 80, internal: 18080, proto: 'TCP', description: 'Evercraft Fabric HTTP' },
  { external: 443, internal: 8443, proto: 'TCP', description: 'Evercraft Fabric HTTPS' },
];

export function classifyReceipt(receipt, expectedHost) {
  const findings = [];
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(expectedHost || '') ||
      expectedHost.split('.').some(n => Number(n) > 255)) {
    return { state: 'INVALID_INPUT', repair_authorized: false, findings: ['Expected host must be a valid IPv4 address'] };
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { state: 'INVALID_RECEIPT', repair_authorized: false, findings: ['Missing or invalid mapping receipt'] };
  }
  if (receipt.host !== expectedHost) {
    return { state: 'STALE_RECEIPT', repair_authorized: false, findings: ['Receipt host differs from current configured host'] };
  }
  const mappings = (receipt.attempts || []).flatMap(a => Array.isArray(a.mappings) ? a.mappings : []);
  const drifting = [];
  for (const owned of OWNED_WEB) {
    const entries = mappings.filter(m => m.requested?.external === owned.external &&
      m.requested?.internal === owned.internal && m.requested?.proto === owned.proto);
    const drift = entries.find(m => m.error === 'owned_mapping_drift');
    if (!drift) continue;
    const obs = drift.observed || {};
    if (obs.description !== owned.description || obs.internal !== owned.internal || !/^\d{1,3}(\.\d{1,3}){3}$/.test(obs.host || '')) {
      return { state: 'OWNERSHIP_UNVERIFIED', repair_authorized: false, findings: [`TCP ${owned.external} differs from exact Evercraft ownership signature`] };
    }
    drifting.push({ external: owned.external, previous_host: obs.host, expected_host: expectedHost });
  }
  if (drifting.length) {
    findings.push(...drifting.map(m => `TCP ${m.external}: router retains ${m.previous_host}, expected ${m.expected_host}`));
    return { state: 'OWNED_MAPPING_DRIFT', repair_authorized: false, admin_ui_required: false,
      public_ingress_verified: false, findings, drifting };
  }
  if (receipt.ownership_conflict === true) {
    return { state: 'OWNERSHIP_CONFLICT', repair_authorized: false, findings: ['Conflict without a fully verified Evercraft drift signature'] };
  }
  if (receipt.ok === true && receipt.public_ingress_verified === true) {
    return { state: 'PUBLIC_VERIFIED', repair_authorized: false, findings: ['Mapping receipt reports independent public verification'] };
  }
  return { state: 'PUBLIC_UNVERIFIED', repair_authorized: false,
    findings: ['No verified ownership drift; require independent external ingress canary'] };
}

function readExpectedHost(env) {
  const match = env.match(/^EVERCRAFT_ROUTER_LAN_HOST=([^\r\n#]+)$/m);
  return match?.[1]?.trim() || '';
}

export function diagnose(receiptFile, envFile) {
  return classifyReceipt(JSON.parse(readFileSync(receiptFile, 'utf8')),
    readExpectedHost(readFileSync(envFile, 'utf8')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = diagnose(
      process.argv[2] || '/var/lib/evercraft/router-map/latest.json',
      process.argv[3] || '/etc/evercraft/router-map.env'
    );
    console.log(JSON.stringify({ schema: 'evercraft.network-guardian.diagnosis.v1', ...report }, null, 2));
    process.exitCode = report.state === 'PUBLIC_VERIFIED' ? 0 : 1;
  } catch (err) {
    console.error(JSON.stringify({ schema: 'evercraft.network-guardian.diagnosis.v1',
      state: 'DIAGNOSTIC_ERROR', repair_authorized: false, error: err.message }));
    process.exitCode = 2;
  }
}
