#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function immutableReleaseRef(env = process.env) {
  const explicit = clean(env.EVERCRAFT_RELEASE_REF);
  if (/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[a-f0-9]{40}$/i.test(value)) return value;
  } catch {}
  throw new Error('immutable_release_ref_unavailable');
}

function parseJsonArray(value, fallback = []) {
  const raw = clean(value);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function reconcileHouseholdFabricResident({
  yard,
  releaseRef,
  deploymentId = 'household-fabric-yakima',
  edgeDeploymentId = 'evercraft-public-edge',
  discovery = {},
  input = {},
  leaseTtlMs = 60 * 60 * 1000,
  renewEveryMs = 30 * 60 * 1000,
  requireIdentityAttestation = true,
} = {}) {
  if (!yard) throw new Error('yard_operator_required');
  if (!/^[a-f0-9]{40}$/i.test(clean(releaseRef))) {
    throw new Error('immutable_release_ref_required');
  }

  const existing = yard.deploymentStatus(deploymentId);
  if (existing?.state === 'ready' &&
      existing?.receipt?.workload_class === 'systemia.household-fabric-yakima.v1') {
    const attestation = await yard.attestDeployment(deploymentId);
    if (requireIdentityAttestation && attestation.identity_verified !== true) {
      return {
        ok: false,
        action: 'held_identity_attestation_failed',
        deployment_id: deploymentId,
        deployment_receipt: existing.receipt?.receipt_hash || null,
        identity_verified: false,
        field_verified: attestation.field_verified === true,
        allocator_authority_exposed: false,
      };
    }
    yard.startLeaseKeeper(deploymentId, { ttlMs: leaseTtlMs, renewEveryMs });
    return {
      ok: true,
      action: 'attached',
      deployment_id: deploymentId,
      deployment_receipt: existing.receipt?.receipt_hash || null,
      node_id: existing.receipt?.capacity_node_id || null,
      identity_verified: attestation.identity_verified === true,
      field_verified: attestation.field_verified === true,
      allocator_authority_exposed: false,
    };
  }

  const authorities = yard.privateCapacityAuthorities();
  if (Number(authorities.source_record_count || 0) === 0) {
    return {
      ok: false,
      action: 'held_allocator_authority_unavailable',
      deployment_id: deploymentId,
      allocator_authority_exposed: false,
      authority_source_records: 0,
    };
  }

  let deployment = null;
  let placement = 'capacity_discovery';
  const edge = yard.deploymentStatus(edgeDeploymentId);
  const edgeNodeId = clean(edge?.receipt?.capacity_node_id);
  const edgeEndpoint = clean(edge?.lease?.capacity_endpoint);
  const edgeAllocator = edgeNodeId ? clean(authorities.allocatorTokens?.[edgeNodeId]) : '';

  if (
    edge?.state === 'ready' &&
    edge?.receipt?.workload_class === 'systemia.public-edge.v1' &&
    edgeNodeId &&
    edgeEndpoint &&
    edgeAllocator
  ) {
    try {
      deployment = await yard.deployRelease({
        deploymentId,
        releaseRef,
        workloadClass: 'systemia.household-fabric-yakima.v1',
        capacityEndpoint: edgeEndpoint,
        allocatorToken: edgeAllocator,
        input,
        rollbackTarget: 'systemia:household-fabric-yakima-previous',
        leaseTtlMs,
      });
      placement = 'public_edge_affinity';
    } catch {}
  }

  if (!deployment) {
    try {
      deployment = await yard.deployDiscoveredRelease({
        deploymentId,
        releaseRef,
        workloadClass: 'systemia.household-fabric-yakima.v1',
        input,
        rollbackTarget: 'systemia:household-fabric-yakima-previous',
        leaseTtlMs,
        allocatorTokens: authorities.allocatorTokens,
        discovery,
      });
      placement = 'capacity_discovery';
    } catch {
      return {
        ok: false,
        action: 'held_capacity_deployment_failed',
        deployment_id: deploymentId,
        error_code: 'household_fabric_capacity_deployment_failed',
        allocator_authority_exposed: false,
        authority_source_records: Number(authorities.source_record_count || 0),
        public_edge_affinity_attempted: Boolean(edgeNodeId && edgeEndpoint && edgeAllocator),
        detail_recorded: false,
      };
    }
  }

  const attestation = await yard.attestDeployment(deploymentId);
  if (requireIdentityAttestation && attestation.identity_verified !== true) {
    try {
      await yard.stopDeployment(deploymentId, { reason: 'identity_attestation_failed' });
    } catch {}
    return {
      ok: false,
      action: 'held_identity_attestation_failed',
      deployment_id: deploymentId,
      deployment_receipt: deployment.receipt?.receipt_hash || null,
      node_id: deployment.receipt?.capacity_node_id || null,
      identity_verified: false,
      field_verified: attestation.field_verified === true,
      allocator_authority_exposed: false,
      authority_source_records: Number(authorities.source_record_count || 0),
    };
  }

  yard.startLeaseKeeper(deploymentId, { ttlMs: leaseTtlMs, renewEveryMs });

  return {
    ok: true,
    action: 'deployed',
    deployment_id: deploymentId,
    deployment_receipt: deployment.receipt?.receipt_hash || null,
    node_id: deployment.receipt?.capacity_node_id || null,
    discovery_receipt: deployment.discovery?.receipt_hash || null,
    discovered_count: Number(deployment.discovery?.discovered_count || 0),
    eligible_count: Number(deployment.discovery?.eligible_count || 0),
    identity_verified: attestation.identity_verified === true,
    field_verified: attestation.field_verified === true,
    resident_health_verified: deployment.receipt?.health_verification === 'healthy',
    placement,
    public_edge_node_id: edgeNodeId || null,
    colocated_with_public_edge: Boolean(edgeNodeId && deployment.receipt?.capacity_node_id === edgeNodeId),
    allocator_authority_exposed: false,
    authority_source_records: Number(authorities.source_record_count || 0),
  };
}

function runtimeConfig(env = process.env) {
  const publicEdgeState = clean(env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR) ||
    'artifacts/public-edge-activation-watch/runtime';
  const yardStateDir = path.resolve(
    clean(env.EVERCRAFT_YARD_STATE_DIR) || path.join(publicEdgeState, 'yard')
  );
  const input = {
    browser_edge_url: clean(env.HOUSEHOLD_FABRIC_BROWSER_EDGE_URL),
    google_credential_ref: clean(env.HOUSEHOLD_GOOGLE_CREDENTIAL_REF),
    kroger_credential_ref: clean(env.HOUSEHOLD_KROGER_CREDENTIAL_REF),
    kroger_zip_code: clean(env.HOUSEHOLD_KROGER_ZIP_CODE) || '98902',
    kroger_locations: parseJsonArray(env.HOUSEHOLD_KROGER_LOCATIONS_JSON),
    kroger_terms: clean(env.HOUSEHOLD_KROGER_TERMS)
      ? clean(env.HOUSEHOLD_KROGER_TERMS).split(',').map(clean).filter(Boolean)
      : [],
    cadence_seconds: 300,
  };
  return {
    yardStateDir,
    input,
    discovery: {
      bindAddress: clean(env.EVERCRAFT_CAPACITY_DISCOVERY_BIND) || '0.0.0.0',
      multicastAddress: clean(env.EVERCRAFT_CAPACITY_DISCOVERY_ADDRESS) || '239.42.24.42',
      port: Math.max(1, Number(env.EVERCRAFT_CAPACITY_DISCOVERY_PORT || 42424)),
      timeoutMs: Math.max(100, Number(env.EVERCRAFT_CAPACITY_DISCOVERY_TIMEOUT_MS || 1000)),
      joinMulticast: clean(env.EVERCRAFT_CAPACITY_DISCOVERY_JOIN_MULTICAST).toLowerCase() !== 'false',
    },
  };
}

async function main() {
  const releaseRef = immutableReleaseRef();
  const config = runtimeConfig();
  const yard = new YardOperator({ stateDir: config.yardStateDir });
  let closing = false;
  let reconciling = false;
  let lastAction = '';

  async function reconcile() {
    if (closing || reconciling) return;
    reconciling = true;
    try {
      const result = await reconcileHouseholdFabricResident({
        yard,
        releaseRef,
        discovery: config.discovery,
        input: config.input,
      });
      if (result.action !== lastAction || result.ok !== true) {
        lastAction = result.action;
        console.log(JSON.stringify({
          schema: 'evercraft.household-fabric.resident-activation.v1',
          ...result,
          founder_login_required: false,
          payment_authority: false,
          external_capacity_provision_authority: false,
        }));
      }
    } finally {
      reconciling = false;
    }
  }

  await reconcile();
  const timer = setInterval(() => reconcile().catch(() => {}), 60_000);
  const keepAlive = setInterval(() => {}, 60_000);

  async function shutdown() {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    clearInterval(keepAlive);
    yard.stopLeaseKeeper('household-fabric-yakima');
    console.log(JSON.stringify({
      schema: 'evercraft.household-fabric.resident-activation.v1',
      ok: true,
      action: 'stopped',
      managed_runtime_left_running: true,
      allocator_authority_exposed: false,
    }));
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown().catch(() => process.exit(1)));
  process.on('SIGINT', () => shutdown().catch(() => process.exit(1)));
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
