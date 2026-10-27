#!/usr/bin/env node
/**
 * Physical Node001 broker activation preflight. Read-only:
 * - inspect a pinned local NodeSeed receipt
 * - query localhost NodeSeed capacity via the receipt's PORT ONLY
 * - inspect whether installed Compute source includes the broker workload
 * - note broker-path strings in Caddy config (NOT route verification)
 *
 * No deployment, credentials, file mutation, sudo, external HTTP, or service restart.
 * Run via sudo only if the local receipt or Caddy configuration is unreadable.
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const RECEIPT = '/var/lib/evercraft/nodeseed/nodeseed-receipt.json';
const RUNTIME = '/opt/evercraft/forge-operator/systemia/compute/runtime-node.mjs';
const CADDY = '/etc/evercraft/Caddyfile';
const WORKLOAD = 'systemia.remote-capacity-broker.v1';

function optionalRead(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { return null; }
}

export function projectPhysicalBrokerPreflight({
  receipt = null,
  capacity = null,
  runtimeSource = null,
  caddyText = null,
  observedAt = new Date().toISOString(),
} = {}) {
  const receiptValid = receipt?.schema === 'evercraft.compute.nodeseed-receipt.v1' &&
    typeof receipt?.node_id === 'string' && Boolean(receipt.node_id);
  const identityMatch = receiptValid &&
    capacity?.node_id === receipt.node_id &&
    typeof receipt?.device_fingerprint === 'string' &&
    capacity?.device_fingerprint === receipt.device_fingerprint;
  const runtimeSupportsBroker = typeof runtimeSource === 'string' &&
    runtimeSource.includes(WORKLOAD);
  const liveOffersBroker = capacity?.protocol === 'evercraft.capacity.v1' &&
    Array.isArray(capacity.supported_workloads) &&
    capacity.supported_workloads.includes(WORKLOAD);
  const localStagingEligible = Boolean(identityMatch && runtimeSupportsBroker && liveOffersBroker);
  const caddyBrokerPathsMentioned = typeof caddyText === 'string' &&
    caddyText.includes('/v1/remote') && caddyText.includes('/nodes');
  return {
    schema: 'evercraft.remote-capacity.physical-preflight.v1',
    observed_at: observedAt,
    source: 'physical_local_read_only',
    nodeseed_receipt_present: Boolean(receipt),
    nodeseed_receipt_schema_valid: receiptValid,
    nodeseed_identity_matches_live_capacity: Boolean(identityMatch),
    installed_compute_supports_broker: runtimeSupportsBroker,
    live_compute_advertises_broker: liveOffersBroker,
    local_broker_staging_eligible: localStagingEligible,
    caddy_configuration_readable: caddyText !== null,
    caddy_broker_paths_mentioned: caddyBrokerPathsMentioned,
    caddy_route_verification: 'not_tested',
    broker_deployment_exists: 'not_tested',
    verified_public_broker_https: false,
    production_device_authorized: 'not_tested',
    cross_machine_dispatch_verified: false,
    remote_execution_enabled_by_probe: false,
    mutations_performed: false,
    credentials_reported: false,
    next_gate: localStagingEligible
      ? 'deploy_supervised_local_only_broker_with_receipt_and_lease_keeper'
      : 'repair_or_reconcile_live_nodeseed_capacity_before_deployment',
  };
}

export async function runPhysicalBrokerPreflight() {
  const rawReceipt = optionalRead(RECEIPT);
  let receipt = null;
  try { if (rawReceipt) receipt = JSON.parse(rawReceipt); } catch {}
  const runtimeSource = optionalRead(RUNTIME);
  const caddyText = optionalRead(CADDY);

  let capacity = null;
  let diagnostic = 'not_attempted';
  if (receipt?.endpoint) {
    try {
      const claimed = new URL(receipt.endpoint);
      const port = Number(claimed.port);
      if (claimed.protocol !== 'http:' || !Number.isInteger(port) ||
          port < 1 || port > 65535) {
        diagnostic = 'receipt_endpoint_invalid';
      } else {
        // Never use the receipt's host as a fetch destination.
        const response = await fetch('http://127.0.0.1:' + port + '/v1/capacity', {
          signal: AbortSignal.timeout(4000),
          headers: {accept: 'application/json'},
        });
        if (response.ok) {
          capacity = await response.json();
          diagnostic = 'responded';
        } else {
          diagnostic = 'non_200_local_capacity';
        }
      }
    } catch {
      diagnostic = 'local_capacity_unreachable_or_invalid';
    }
  } else {
    diagnostic = 'receipt_missing_endpoint';
  }

  const result = projectPhysicalBrokerPreflight({
    receipt, capacity, runtimeSource, caddyText,
  });
  return {...result, local_capacity_probe: diagnostic};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runPhysicalBrokerPreflight();
  console.log(JSON.stringify(report, null, 2));
  if (!report.local_broker_staging_eligible) process.exitCode = 2;
}
