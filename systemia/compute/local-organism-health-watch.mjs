#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha = (value) =>
  'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    if (text.length > 256 * 1024) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function loopbackEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'http:') return null;
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const port = Number(url.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { url, port };
  } catch {
    return null;
  }
}

function requestHealth(endpoint, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.request({
      hostname: endpoint.url.hostname.replace(/^\[|\]$/g, ''),
      port: endpoint.port,
      path: '/v1/health',
      method: 'GET',
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes <= 65536) chunks.push(chunk);
      });
      response.on('end', () => {
        let body = null;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {}
        resolve({
          ok: response.statusCode === 200 && body?.ok === true,
          status: response.statusCode || null,
          body,
          error: null,
        });
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({
      ok: false,
      status: null,
      body: null,
      error: String(error?.message || error).slice(0, 240),
    }));
    request.end();
  });
}

function serviceState(execImpl = execFileSync) {
  try {
    const stdout = execImpl(
      'systemctl',
      ['--user', 'is-active', 'evercraft-local-organism.service'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    );
    return String(stdout || '').trim() === 'active' ? 'active' : String(stdout || '').trim() || 'unknown';
  } catch (error) {
    return String(error?.stdout || '').trim() || 'inactive_or_unknown';
  }
}

function restartService(execImpl = execFileSync) {
  execImpl(
    'systemctl',
    ['--user', 'restart', 'evercraft-local-organism.service'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkLocalOrganismHealth({
  stateRoot,
  requestImpl = requestHealth,
  execImpl = execFileSync,
  restartOnFailure = true,
  now = () => new Date(),
  cooldownMs = 90_000,
  recoveryWaitMs = 8_000,
} = {}) {
  if (!stateRoot) throw new Error('stateRoot is required');
  const root = path.resolve(stateRoot);
  const seedReceiptFile = path.join(root, 'compute', 'nodeseed-receipt.json');
  const organismReceiptFile = path.join(root, 'local-organism-receipt.json');
  const watchFile = path.join(root, 'health-watch.json');

  const inspect = async () => {
    const seed = readJson(seedReceiptFile);
    const organism = readJson(organismReceiptFile);
    const endpoint = loopbackEndpoint(seed?.endpoint);
    const probe = endpoint
      ? await requestImpl(endpoint)
      : { ok: false, status: null, body: null, error: 'loopback_nodeseed_endpoint_unavailable' };

    return {
      service_state: serviceState(execImpl),
      seed_receipt_present: Boolean(seed),
      organism_receipt_present: Boolean(organism),
      node_id: seed?.node_id || organism?.node_id || null,
      device_fingerprint: seed?.device_fingerprint || organism?.device_fingerprint || null,
      nodeseed_endpoint_scope: endpoint ? 'loopback_only' : 'unavailable_or_rejected',
      nodeseed_health: {
        ok: probe.ok === true,
        status: probe.status,
        runtime: probe.body?.runtime || null,
        node_id: probe.body?.node_id || null,
        error: probe.error,
      },
      remote_operator_enabled:
        organism?.remote_operator?.enabled === true,
      remote_admission_configured:
        organism?.remote_admission?.configured === true,
      remote_admission_startup_state:
        organism?.remote_admission?.state || null,
    };
  };

  const before = await inspect();
  const healthy =
    before.service_state === 'active' &&
    before.seed_receipt_present &&
    before.nodeseed_health.ok === true;

  if (healthy) {
    const body = {
      schema: 'evercraft.local-organism-health-watch.v1',
      state: 'healthy',
      action: 'none',
      ...before,
      authority: 'local_user_service_restart_only',
      secret_material_exposed: false,
      observed_at: now().toISOString(),
    };
    const result = { ...body, receipt_hash: sha(body) };
    atomicJson(watchFile, result);
    return result;
  }

  const previous = readJson(watchFile);
  const previousRestart = previous?.restart_attempted_at
    ? Date.parse(previous.restart_attempted_at)
    : 0;
  const nowMs = now().getTime();
  const cooldownActive =
    Number.isFinite(previousRestart) &&
    previousRestart > 0 &&
    nowMs - previousRestart < cooldownMs;

  if (!restartOnFailure || cooldownActive) {
    const body = {
      schema: 'evercraft.local-organism-health-watch.v1',
      state: 'degraded',
      action: cooldownActive ? 'restart_cooldown' : 'observe_only',
      ...before,
      authority: 'local_user_service_restart_only',
      secret_material_exposed: false,
      restart_attempted_at: previous?.restart_attempted_at || null,
      observed_at: now().toISOString(),
    };
    const result = { ...body, receipt_hash: sha(body) };
    atomicJson(watchFile, result);
    return result;
  }

  const attemptedAt = now().toISOString();
  let restartError = null;
  try {
    restartService(execImpl);
  } catch (error) {
    restartError = String(error?.stderr || error?.message || error).trim().slice(0, 500);
  }

  if (!restartError) {
    const deadline = Date.now() + Math.max(500, recoveryWaitMs);
    while (Date.now() < deadline) {
      await sleep(350);
      const after = await inspect();
      if (
        after.service_state === 'active' &&
        after.seed_receipt_present &&
        after.nodeseed_health.ok === true
      ) {
        const body = {
          schema: 'evercraft.local-organism-health-watch.v1',
          state: 'recovered',
          action: 'restart',
          before,
          after,
          authority: 'local_user_service_restart_only',
          secret_material_exposed: false,
          restart_attempted_at: attemptedAt,
          observed_at: now().toISOString(),
        };
        const result = { ...body, receipt_hash: sha(body) };
        atomicJson(watchFile, result);
        return result;
      }
    }
  }

  const after = await inspect();
  const body = {
    schema: 'evercraft.local-organism-health-watch.v1',
    state: 'degraded',
    action: 'restart_failed',
    before,
    after,
    restart_error: restartError,
    authority: 'local_user_service_restart_only',
    secret_material_exposed: false,
    restart_attempted_at: attemptedAt,
    observed_at: now().toISOString(),
  };
  const result = { ...body, receipt_hash: sha(body) };
  atomicJson(watchFile, result);
  return result;
}

const MODULE_FILE = fileURLToPath(import.meta.url);
const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(MODULE_FILE);

if (isCli) {
  const stateRoot = arg(
    '--root',
    process.env.EVERCRAFT_LOCAL_ORGANISM_ROOT ||
      path.join(process.env.HOME || '', '.local', 'state', 'evercraft', 'organism')
  );
  const result = await checkLocalOrganismHealth({
    stateRoot,
    restartOnFailure: !process.argv.includes('--observe-only'),
  });
  console.log(JSON.stringify(result, null, 2));
}
