#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { YardOperator } from '../yard/operator.mjs';
import { YardPublicRouteBroker } from '../yard/public-route-broker.mjs';

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

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

function loadJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function validateHouseholdFabricTodayCanary(payload, {
  now = new Date(),
  maxAgeMs = 15 * 60 * 1000,
} = {}) {
  const generated = Date.parse(clean(payload?.generated_at));
  const ageMs = Number.isFinite(generated) ? Math.max(0, now.getTime() - generated) : null;
  const guardrails = payload?.guardrails || {};
  const ok = Boolean(
    payload?.ok === true &&
    payload?.schema === 'evercraft.household-fabric.public-today.v1' &&
    payload?.geography === 'yakima-wa' &&
    Number.isFinite(generated) &&
    ageMs <= maxAgeMs &&
    Array.isArray(payload?.opportunities) &&
    payload?.coverage &&
    !Object.prototype.hasOwnProperty.call(payload.coverage, 'categories') &&
    guardrails.sponsorship_affects_rank === false &&
    guardrails.poverty_score_used === false &&
    guardrails.personal_data_sale_required === false &&
    guardrails.stale_money_claims_allowed === false
  );
  return {
    ok,
    age_ms: ageMs,
    generated_at: Number.isFinite(generated) ? new Date(generated).toISOString() : null,
    status: clean(payload?.status) || null,
    opportunities_shown: Number(payload?.headline?.opportunities_shown || 0),
    coverage_healthy: payload?.coverage?.healthy === true,
  };
}

async function fetchTodayCanary(origin, {
  fetchImpl = fetch,
  now = new Date(),
  maxAgeMs = 15 * 60 * 1000,
} = {}) {
  try {
    const response = await fetchImpl(
      new URL('/api/household-fabric/yakima/today', origin).toString(),
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status_code: response.status,
        reason: 'today_http_unavailable',
      };
    }
    const validated = validateHouseholdFabricTodayCanary(body, { now, maxAgeMs });
    return {
      ...validated,
      status_code: response.status,
      reason: validated.ok ? null : 'today_canary_invalid',
    };
  } catch {
    return {
      ok: false,
      status_code: null,
      reason: 'today_canary_unreachable',
    };
  }
}

export async function reconcileHouseholdFabricPublicRoute({
  yard,
  releaseRef,
  edgeDeploymentId = 'evercraft-public-edge',
  residentDeploymentId = 'household-fabric-yakima',
  originDeploymentId = 'household-fabric-public-origin',
  requestedHostname = 'household',
  stableHostname = true,
  routeTtlMs = 60 * 60 * 1000,
  bindingState = null,
  allowLoopbackProof = false,
  maxTodayAgeMs = 15 * 60 * 1000,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  if (!yard) throw new Error('yard_operator_required');
  if (!/^[a-f0-9]{40}$/i.test(clean(releaseRef))) {
    throw new Error('immutable_release_ref_required');
  }

  const edge = yard.deploymentStatus(edgeDeploymentId);
  const resident = yard.deploymentStatus(residentDeploymentId);
  if (edge?.state !== 'ready' || edge.receipt?.workload_class !== 'systemia.public-edge.v1') {
    return { ok: false, action: 'held_public_edge_not_ready', promotable: false };
  }
  if (
    resident?.state !== 'ready' ||
    resident.receipt?.workload_class !== 'systemia.household-fabric-yakima.v1' ||
    !resident.result?.local_url
  ) {
    return { ok: false, action: 'held_household_resident_not_ready', promotable: false };
  }
  if (edge.receipt?.capacity_node_id !== resident.receipt?.capacity_node_id) {
    return {
      ok: false,
      action: 'held_resident_public_edge_node_mismatch',
      promotable: false,
      edge_node_id: edge.receipt?.capacity_node_id || null,
      resident_node_id: resident.receipt?.capacity_node_id || null,
    };
  }

  let origin = yard.deploymentStatus(originDeploymentId);
  if (
    !origin ||
    origin.state !== 'ready' ||
    origin.receipt?.workload_class !== 'systemia.household-fabric-public-origin.v1'
  ) {
    try {
      origin = await yard.deploySiblingRelease({
        sourceDeploymentId: residentDeploymentId,
        deploymentId: originDeploymentId,
        releaseRef,
        workloadClass: 'systemia.household-fabric-public-origin.v1',
        input: { source_url: resident.result.local_url },
        rollbackTarget: 'systemia:household-fabric-public-origin-previous',
        leaseTtlMs: routeTtlMs,
      });
    } catch {
      return {
        ok: false,
        action: 'held_public_origin_deploy_failed',
        promotable: false,
        error_code: 'household_public_origin_deploy_failed',
      };
    }
  }

  if (
    origin.receipt?.capacity_node_id !== edge.receipt?.capacity_node_id ||
    origin.receipt?.capacity_node_id !== resident.receipt?.capacity_node_id
  ) {
    return {
      ok: false,
      action: 'held_public_origin_node_mismatch',
      promotable: false,
    };
  }

  const bindingFresh = Boolean(
    bindingState?.binding?.deployment_receipt_hash === origin.receipt?.receipt_hash &&
    bindingState?.binding?.instance_id === origin.result?.instance_id &&
    Number.isFinite(Date.parse(bindingState?.binding?.bound_at)) &&
    now.getTime() - Date.parse(bindingState.binding.bound_at) < routeTtlMs / 2
  );

  let binding = bindingFresh ? bindingState.binding : null;
  let broker = null;
  if (!binding) {
    try {
      broker = new YardPublicRouteBroker({
        yard,
        providerClient: yard.publicRouteProviderClient(edgeDeploymentId),
        allowLoopbackProof,
      });
      const next = await broker.bindDeployment(originDeploymentId, {
        requestedHostname,
        ttlMs: routeTtlMs,
        stableHostname,
      });
      binding = next;
    } catch {
      return {
        ok: false,
        action: 'held_public_route_bind_failed',
        promotable: false,
        error_code: 'household_public_route_bind_failed',
      };
    }
  }

  const canary = await fetchTodayCanary(binding.origin, {
    fetchImpl,
    now,
    maxAgeMs: maxTodayAgeMs,
  });

  if (!canary.ok) {
    if (!bindingFresh && broker) {
      try { await broker.releaseBinding(binding, { reason: 'fresh_today_canary_failed' }); } catch {}
    }
    return {
      ok: false,
      action: 'held_fresh_today_canary_failed',
      promotable: false,
      route_verified: binding.route_verified === true,
      route_scope: binding.route_scope || null,
      canary,
    };
  }

  if (!bindingFresh && broker && bindingState?.binding?.route_lease_id) {
    try {
      await broker.releaseBinding(bindingState.binding, { reason: 'route_refreshed' });
    } catch {}
  }

  const promotable = binding.route_verified === true && binding.route_scope === 'public_https';
  return {
    ok: true,
    action: bindingFresh ? 'verified_existing_route' : 'bound_and_verified',
    promotable,
    route_verified: binding.route_verified === true,
    route_scope: binding.route_scope || null,
    origin: binding.origin,
    deployment_id: originDeploymentId,
    deployment_receipt: origin.receipt?.receipt_hash || null,
    route_binding_receipt: binding.receipt_hash || null,
    public_route_receipt: binding.public_route_receipt_hash || null,
    canary,
    binding,
    authority: {
      allocator_authority_exposed: false,
      credential_material_exposed: false,
      provider_secret_exposed: false,
    },
  };
}

async function main() {
  const releaseRef = immutableReleaseRef();
  const publicEdgeState = clean(process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR) ||
    'artifacts/public-edge-activation-watch/runtime';
  const yardStateDir = path.resolve(
    clean(process.env.EVERCRAFT_YARD_STATE_DIR) || path.join(publicEdgeState, 'yard')
  );
  const controllerStateDir = path.resolve(
    clean(process.env.HOUSEHOLD_FABRIC_PUBLIC_ROUTE_STATE_DIR) ||
    path.join(publicEdgeState, 'household-fabric-public-route')
  );
  const stateFile = path.join(controllerStateDir, 'state.json');
  const yard = new YardOperator({ stateDir: yardStateDir });
  const requestedHostname = clean(process.env.HOUSEHOLD_FABRIC_PUBLIC_HOSTNAME) || 'household';

  let closing = false;
  let inFlight = false;
  let timer = null;
  let lastAction = '';

  async function reconcile() {
    if (closing || inFlight) return;
    inFlight = true;
    try {
      const previous = loadJson(stateFile, null);
      const result = await reconcileHouseholdFabricPublicRoute({
        yard,
        releaseRef,
        requestedHostname,
        bindingState: previous,
        allowLoopbackProof: false,
      });
      if (result.ok && result.binding) {
        atomicJson(stateFile, {
          schema: 'evercraft.household-fabric.public-route-state.v1',
          binding: result.binding,
          canary: result.canary,
          promotable: result.promotable === true,
          updated_at: new Date().toISOString(),
        });
      }
      if (result.action !== lastAction || result.ok !== true || result.promotable === true) {
        lastAction = result.action;
        const { binding: _binding, ...safeResult } = result;
        console.log(JSON.stringify({
          schema: 'evercraft.household-fabric.public-route-runner.v1',
          ...safeResult,
          founder_login_required: false,
          payment_authority: false,
          allocator_authority_exposed: false,
        }));
      }
    } finally {
      inFlight = false;
    }
  }

  await reconcile();
  timer = setInterval(() => reconcile().catch(() => {}), 5 * 60 * 1000);
  const keepAlive = setInterval(() => {}, 60_000);

  async function shutdown() {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    clearInterval(keepAlive);
    console.log(JSON.stringify({
      schema: 'evercraft.household-fabric.public-route-runner.v1',
      ok: true,
      action: 'stopped',
      managed_routes_left_running: true,
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
