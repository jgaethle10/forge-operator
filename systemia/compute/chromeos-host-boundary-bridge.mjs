import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'evercraft.chromeos-host-boundary-observation.v1';
const STATUS_SCHEMA = 'evercraft.chromeos-host-boundary-status.v1';
const RECEIPT_SCHEMA = 'evercraft.chromeos-host-boundary-receipt.v1';
const CHECK_SCHEMA = 'evercraft.chromeos-host-boundary-check-request.v1';
const CAPABILITY_ID = 'chromeos.crostini.port-forwarding.read.v1';
const DEFAULT_PORTS = new Set([18080, 8443]);
const DEFAULT_STATE_ROOT = path.join(
  os.homedir(),
  '.local',
  'state',
  'evercraft',
  'organism',
  'chromeos-host-boundary',
);

function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function tokenDigest(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

function equalToken(left, right) {
  return timingSafeEqual(tokenDigest(left), tokenDigest(right));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

function readJson(file, maxBytes = 128 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('chromeos_host_boundary_port_invalid');
  }
  return port;
}

function normalizeProtocol(value) {
  const protocol = String(value || '').trim().toUpperCase();
  if (!['TCP', 'UDP'].includes(protocol)) {
    throw new Error('chromeos_host_boundary_protocol_invalid');
  }
  return protocol;
}

function normalizeBooleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeText(value, max = 160) {
  const text = String(value ?? '').trim();
  return text.slice(0, max);
}

function checkFile(stateRoot) {
  return path.join(stateRoot, 'check-request.json');
}

function sealState(body) {
  return { ...body, state_hash: sha(body) };
}

function verifyState(record) {
  if (!record || typeof record !== 'object') return false;
  const { state_hash: claimed, ...body } = record;
  return Boolean(claimed && claimed === sha(body));
}

function normalizedRequestId(value) {
  const id = safeText(value, 96);
  if (!id) return null;
  if (!/^hostcheck_[a-f0-9]{20,80}$/i.test(id)) {
    throw new Error('chromeos_host_boundary_request_id_invalid');
  }
  return id;
}

export function requestChromeOsHostBoundaryCheck({
  stateRoot = DEFAULT_STATE_ROOT,
  now = Date.now(),
  ttlMs = 2 * 60_000,
} = {}) {
  const existing = readJson(checkFile(stateRoot));
  if (
    verifyState(existing) &&
    existing.status === 'pending' &&
    new Date(existing.expires_at).getTime() > now
  ) {
    return existing;
  }

  const requestId = 'hostcheck_' + randomBytes(12).toString('hex');
  const body = {
    schema: CHECK_SCHEMA,
    capability_id: CAPABILITY_ID,
    request_id: requestId,
    status: 'pending',
    requested_at: new Date(now).toISOString(),
    expires_at: new Date(now + Math.max(30_000, Math.min(ttlMs, 10 * 60_000))).toISOString(),
    completed_at: null,
    result_receipt_hash: null,
  };
  const record = sealState(body);
  atomicJson(checkFile(stateRoot), record);
  return record;
}

export function readChromeOsHostBoundaryCheck({
  stateRoot = DEFAULT_STATE_ROOT,
  now = Date.now(),
} = {}) {
  const record = readJson(checkFile(stateRoot));
  if (!record) return { ok: true, pending: false, state: 'none', request: null };
  if (!verifyState(record)) {
    return { ok: false, pending: false, state: 'integrity_failed', request: null };
  }
  const expired =
    record.status === 'pending' &&
    new Date(record.expires_at).getTime() <= now;
  if (expired) {
    return {
      ok: true,
      pending: false,
      state: 'expired',
      request: { ...record, state_hash: undefined },
    };
  }
  return {
    ok: true,
    pending: record.status === 'pending',
    state: record.status,
    request: { ...record, state_hash: undefined },
  };
}

function completeChromeOsHostBoundaryCheck({
  stateRoot,
  requestId,
  receiptHash,
  now,
}) {
  if (!requestId) return null;
  const record = readJson(checkFile(stateRoot));
  if (!verifyState(record)) return null;
  if (record.status !== 'pending') return null;
  if (record.request_id !== requestId) return null;
  if (new Date(record.expires_at).getTime() <= now) return null;

  const { state_hash: _ignored, ...body } = record;
  const completed = sealState({
    ...body,
    status: 'completed',
    completed_at: new Date(now).toISOString(),
    result_receipt_hash: receiptHash,
  });
  atomicJson(checkFile(stateRoot), completed);
  return completed;
}

export function validateChromeOsHostBoundaryObservation(
  input,
  { allowedPorts = DEFAULT_PORTS, now = Date.now(), maxClockSkewMs = 10 * 60_000 } = {},
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('chromeos_host_boundary_observation_required');
  }
  if (input.schema !== SCHEMA) throw new Error('chromeos_host_boundary_schema_invalid');
  if (input.capability_id && input.capability_id !== CAPABILITY_ID) {
    throw new Error('chromeos_host_boundary_capability_invalid');
  }

  const collectedAt = new Date(String(input.collected_at || ''));
  if (!Number.isFinite(collectedAt.getTime())) {
    throw new Error('chromeos_host_boundary_collected_at_invalid');
  }
  if (Math.abs(now - collectedAt.getTime()) > maxClockSkewMs) {
    throw new Error('chromeos_host_boundary_observation_outside_clock_window');
  }

  if (!Array.isArray(input.ports) || input.ports.length > 16) {
    throw new Error('chromeos_host_boundary_ports_invalid');
  }

  const requestId = normalizedRequestId(input.request_id);

  const ports = [];
  const seen = new Set();
  for (const raw of input.ports) {
    const port = boundedPort(raw?.port);
    if (!allowedPorts.has(port)) throw new Error('chromeos_host_boundary_port_not_admitted');
    const protocol = normalizeProtocol(raw?.protocol);
    const key = protocol + ':' + port;
    if (seen.has(key)) throw new Error('chromeos_host_boundary_duplicate_port');
    seen.add(key);
    ports.push({
      port,
      protocol,
      present: normalizeBooleanOrNull(raw?.present),
      enabled: normalizeBooleanOrNull(raw?.enabled),
      disabled: normalizeBooleanOrNull(raw?.disabled),
      evidence: safeText(raw?.evidence || 'automation_accessibility_tree', 96),
    });
  }

  const scan = input.scan && typeof input.scan === 'object' ? input.scan : {};
  return {
    schema: SCHEMA,
    capability_id: CAPABILITY_ID,
    collected_at: collectedAt.toISOString(),
    request_id: requestId,
    observer_version: safeText(input.observer_version || 'unknown', 48),
    observer_install_id: safeText(input.observer_install_id || 'unknown', 96),
    settings_route: safeText(input.settings_route || 'chrome://os-settings/crostini/portForwarding', 256),
    ports: ports.sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol)),
    scan: {
      settings_surface_observed: scan.settings_surface_observed === true,
      tree_source: safeText(scan.tree_source || 'unknown', 48),
      nodes_examined: Math.max(0, Math.min(20_000, Number(scan.nodes_examined || 0))),
      bounded: scan.bounded !== false,
      toggle_candidates: Math.max(0, Math.min(1000, Number(scan.toggle_candidates || 0))),
      matched_ports: Math.max(0, Math.min(16, Number(scan.matched_ports || 0))),
      unmatched_toggle_candidates: Math.max(
        0,
        Math.min(1000, Number(scan.unmatched_toggle_candidates || 0)),
      ),
      error: scan.error ? safeText(scan.error, 200) : null,
    },
    authority: {
      read_only: true,
      platform_permission_scope: 'chromeos_desktop_automation',
      platform_permission_is_broad: true,
      arbitrary_ui_automation_exposed: false,
      mutation_command_surface_exposed: false,
      screenshots_collected: false,
      raw_accessibility_tree_persisted: false,
    },
  };
}

export function storeChromeOsHostBoundaryObservation(
  input,
  { stateRoot = DEFAULT_STATE_ROOT, allowedPorts = DEFAULT_PORTS, now = Date.now() } = {},
) {
  const observation = validateChromeOsHostBoundaryObservation(input, { allowedPorts, now });
  const body = {
    schema: RECEIPT_SCHEMA,
    received_at: new Date(now).toISOString(),
    observation,
    observation_hash: sha(observation),
    authority: {
      source: 'paired_chromeos_extension',
      bearer_authenticated: true,
      mutation_authority: false,
    },
  };
  const receipt = { ...body, receipt_hash: sha(body) };
  atomicJson(path.join(stateRoot, 'latest.json'), receipt);
  completeChromeOsHostBoundaryCheck({
    stateRoot,
    requestId: observation.request_id,
    receiptHash: receipt.receipt_hash,
    now,
  });
  return receipt;
}

export function readChromeOsHostBoundaryStatus({
  stateRoot = DEFAULT_STATE_ROOT,
  now = Date.now(),
  maxAgeMs = 5 * 60_000,
} = {}) {
  const file = path.join(stateRoot, 'latest.json');
  const receipt = readJson(file);
  if (!receipt) {
    return {
      ok: false,
      schema: STATUS_SCHEMA,
      capability_id: CAPABILITY_ID,
      state: 'never_reported',
      fresh: false,
      ports: [],
      source: 'paired_chromeos_extension',
      mutation_supported: false,
      receipt_hash: null,
    };
  }

  const { receipt_hash: claimedHash, ...receiptBody } = receipt;
  const integrityOk = Boolean(claimedHash && claimedHash === sha(receiptBody));
  const collectedAt = new Date(String(receipt?.observation?.collected_at || ''));
  const ageMs = Number.isFinite(collectedAt.getTime())
    ? Math.max(0, now - collectedAt.getTime())
    : Number.POSITIVE_INFINITY;
  const fresh = integrityOk && ageMs <= maxAgeMs;

  return {
    ok: fresh,
    schema: STATUS_SCHEMA,
    capability_id: CAPABILITY_ID,
    state: !integrityOk ? 'receipt_integrity_failed' : fresh ? 'fresh' : 'stale',
    fresh,
    age_ms: Number.isFinite(ageMs) ? ageMs : null,
    collected_at: receipt?.observation?.collected_at || null,
    received_at: receipt?.received_at || null,
    request_id: receipt?.observation?.request_id || null,
    observer_version: receipt?.observation?.observer_version || null,
    observer_install_id: receipt?.observation?.observer_install_id || null,
    settings_route: receipt?.observation?.settings_route || null,
    ports: Array.isArray(receipt?.observation?.ports) ? receipt.observation.ports : [],
    scan: receipt?.observation?.scan || null,
    source: 'paired_chromeos_extension',
    evidence_mode: 'direct_chromeos_accessibility_observation',
    mutation_supported: false,
    raw_accessibility_tree_persisted: false,
    screenshots_collected: false,
    receipt_hash: integrityOk ? claimedHash : null,
  };
}

async function readRequestJson(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('chromeos_host_boundary_request_too_large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function bearer(req) {
  const value = String(req.headers.authorization || '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function send(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  res.end(data);
}

export function startChromeOsHostBoundaryBridge({
  host = process.env.EVERCRAFT_CHROMEOS_HOST_BRIDGE_HOST || '0.0.0.0',
  port = Number(process.env.EVERCRAFT_CHROMEOS_HOST_BRIDGE_PORT || 18081),
  token = process.env.EVERCRAFT_CHROMEOS_HOST_BRIDGE_TOKEN || '',
  stateRoot = process.env.EVERCRAFT_CHROMEOS_HOST_BOUNDARY_STATE_DIR || DEFAULT_STATE_ROOT,
} = {}) {
  const loopbackHost = ['127.0.0.1', 'localhost', '::1'].includes(String(host));
  const listenPort = Number(port) === 0 && loopbackHost ? 0 : boundedPort(port);
  const secret = String(token || '').trim();
  if (secret.length < 32) throw new Error('chromeos_host_boundary_bridge_token_required');

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return send(res, 200, {
          ok: true,
          service: 'evercraft-chromeos-host-boundary-bridge',
          schema: 'evercraft.chromeos-host-boundary-bridge-health.v1',
          accepts_mutation_commands: false,
          persists_raw_accessibility_tree: false,
          supports_on_demand_checks: true,
          minimum_extension_poll_seconds: 30,
        });
      }

      if (req.method === 'GET' && req.url === '/v1/chromeos-host-boundary/status') {
        if (!equalToken(bearer(req), secret)) {
          return send(res, 401, { ok: false, error: 'chromeos_host_boundary_auth_required' });
        }
        return send(res, 200, readChromeOsHostBoundaryStatus({ stateRoot }));
      }

      if (req.method === 'GET' && req.url === '/v1/chromeos-host-boundary/next-request') {
        if (!equalToken(bearer(req), secret)) {
          return send(res, 401, { ok: false, error: 'chromeos_host_boundary_auth_required' });
        }
        const check = readChromeOsHostBoundaryCheck({ stateRoot });
        return send(res, 200, {
          ok: check.ok,
          state: check.state,
          request: check.pending ? {
            request_id: check.request?.request_id || null,
            requested_at: check.request?.requested_at || null,
            expires_at: check.request?.expires_at || null,
          } : null,
        });
      }

      if (req.method === 'POST' && req.url === '/v1/chromeos-host-boundary/report') {
        if (!equalToken(bearer(req), secret)) {
          return send(res, 401, { ok: false, error: 'chromeos_host_boundary_auth_required' });
        }
        const body = await readRequestJson(req);
        const receipt = storeChromeOsHostBoundaryObservation(body, { stateRoot });
        return send(res, 200, {
          ok: true,
          receipt_hash: receipt.receipt_hash,
          observation_hash: receipt.observation_hash,
        });
      }

      return send(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return send(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: typeof address === 'object' && address ? address.port : listenPort,
        stateRoot,
      });
    });
  });
}

const moduleFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(moduleFile)) {
  const runtime = await startChromeOsHostBoundaryBridge();
  console.log(JSON.stringify({
    ok: true,
    service: 'evercraft-chromeos-host-boundary-bridge',
    listen: runtime.host + ':' + runtime.port,
    state_root: runtime.stateRoot,
    mutation_supported: false,
  }, null, 2));

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => runtime.server.close(() => process.exit(0)));
  }
}
