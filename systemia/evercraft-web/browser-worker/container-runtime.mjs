import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startBrowserPublicAdapter } from './public-adapter.mjs';
import { signDurableJobRequest } from './systemia-admission.mjs';

const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_START_TIMEOUT_MS = 30_000;

function command(command, args, { timeout = 30_000 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim().slice(0, 4000);
    throw new Error(`${command}_failed:${detail || result.status}`);
  }
  return String(result.stdout || '').trim();
}

export function browserContainerAvailable() {
  try {
    command('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function parseDockerPort(value) {
  const lines = String(value || '').trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::1):(\d+)$/);
    if (match) {
      const port = Number(match[1]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    }
  }
  throw new Error('browser_container_port_unavailable');
}

async function fetchJson(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`browser_worker_invalid_json:${response.status}`);
    }
    if (!response.ok) {
      const error = new Error(body?.error || `browser_worker_http_${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error('browser_worker_http_' + response.status);
      error.status = response.status;
      error.body = body.slice(0, 2000);
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(url, timeoutMs = DEFAULT_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await fetchJson(`${url}/healthz`, {}, 1500);
      if (health?.ok === true && health?.service === 'evercraft-owned-browser-worker') {
        return health;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`browser_worker_health_timeout:${lastError?.message || 'unknown'}`);
}

export async function startBrowserContainer({
  sourceDir,
  maxConcurrency = 2,
  buildTimeoutMs = DEFAULT_BUILD_TIMEOUT_MS,
  startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  imageTag = '',
  durableJobVolume = '',
  systemiaJobKey = '',
} = {}) {
  const root = path.resolve(String(sourceDir || ''));
  if (!root) throw new Error('browser_worker_source_dir_required');
  if (!browserContainerAvailable()) throw new Error('browser_container_runtime_unavailable');
  if (Boolean(durableJobVolume) !== Boolean(systemiaJobKey)) {
    throw new Error('browser_durable_volume_and_systemia_key_required_together');
  }
  if (durableJobVolume && !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$/.test(durableJobVolume)) {
    throw new Error('browser_durable_volume_name_invalid');
  }
  if (systemiaJobKey && Buffer.byteLength(String(systemiaJobKey)) < 32) {
    throw new Error('browser_systemia_job_signing_key_invalid');
  }

  const sourceFingerprint = crypto
    .createHash('sha256')
    .update(root)
    .digest('hex')
    .slice(0, 12);
  const image = String(imageTag || `evercraft/browser-worker:yard-${sourceFingerprint}`);
  command('docker', ['build', '-q', '-t', image, root], { timeout: buildTimeoutMs });

  const workerToken = crypto.randomBytes(32).toString('hex');
  const authOperatorToken = crypto.randomBytes(32).toString('hex');
  const name = `evercraft-browser-${crypto.randomBytes(6).toString('hex')}`;
  const runArgs = [
    'run',
    '-d',
    '--rm',
    '--init',
    '--name', name,
    '--pids-limit', '512',
    '--memory', '1024m',
    '--cpus', '2',
    '-e', `EVERCRAFT_BROWSER_WORKER_TOKEN=${workerToken}`,
    ...(durableJobVolume ? [
      '-e', `EVERCRAFT_BROWSER_SYSTEMIA_JOB_KEY=${systemiaJobKey}`,
      '-e', 'EVERCRAFT_BROWSER_JOB_STATE_DIR=/var/lib/evercraft-browser-jobs',
      '--mount', `type=volume,source=${durableJobVolume},target=/var/lib/evercraft-browser-jobs`,
    ] : []),
    '-e', `EVERCRAFT_AUTH_BROWSER_OPERATOR_TOKEN=${authOperatorToken}`,
    '-e', `EVERCRAFT_BROWSER_MAX_CONCURRENCY=${Math.max(1, Math.min(8, Number(maxConcurrency) || 2))}`,
    '-p', '127.0.0.1::8787',
    image,
  ];
  const containerId = command('docker', runArgs, { timeout: 30_000 });
  let closed = false;
  let deploymentReceiptRef = '';

  try {
    const published = command('docker', ['port', containerId, '8787/tcp'], { timeout: 5000 });
    const port = parseDockerPort(published);
    const url = `http://127.0.0.1:${port}`;
    const initialHealth = await waitForHealth(url, startTimeoutMs);
    const instanceId = `browser_${containerId.slice(0, 16)}`;

    const health = async () => {
      const worker = await fetchJson(`${url}/healthz`, {}, 3000);
      return {
        ...worker,
        runtime: 'Evercraft Compute',
        instance_id: instanceId,
        container_id_sha256: crypto.createHash('sha256').update(containerId).digest('hex'),
        deployment_receipt_ref: deploymentReceiptRef || null,
      };
    };

    const runtime = {
      url,
      instanceId,
      image,
      containerId,
      initialHealth,
      async health() {
        return health();
      },
      async browse(job) {
        return fetchJson(`${url}/v1/browse`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${workerToken}`,
          },
          body: JSON.stringify(job || {}),
        }, Math.max(35_000, Number(job?.timeout_ms || 15_000) + 5000));
      },
      async submitReadOnlyJob(envelope) {
        if(!durableJobVolume) throw new Error('browser_durable_job_volume_not_configured');
        const endpoint='/v1/jobs',raw=JSON.stringify(envelope||{});
        return fetchJson(`${url}${endpoint}`,{
          method:'POST',
          headers:{'content-type':'application/json',
            ...signDurableJobRequest(systemiaJobKey,{method:'POST',path:endpoint,body:raw})},
          body:raw,
        },10000);
      },
      async readReadOnlyJob(jobId) {
        if(!durableJobVolume) throw new Error('browser_durable_job_volume_not_configured');
        const endpoint=`/v1/jobs/${encodeURIComponent(String(jobId||''))}`;
        return fetchJson(`${url}${endpoint}`,{
          headers:signDurableJobRequest(systemiaJobKey,{method:'GET',path:endpoint,body:''}),
        },10000);
      },
      async cancelReadOnlyJob(jobId) {
        if(!durableJobVolume) throw new Error('browser_durable_job_volume_not_configured');
        const endpoint=`/v1/jobs/${encodeURIComponent(String(jobId||''))}`;
        return fetchJson(`${url}${endpoint}`,{
          method:'DELETE',
          headers:signDurableJobRequest(systemiaJobKey,{method:'DELETE',path:endpoint,body:''}),
        },10000);
      },
      async createAuthSession(job) {
        return fetchJson(`${url}/v1/auth-browser/sessions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${authOperatorToken}`,
          },
          body: JSON.stringify(job || {}),
        }, 35_000);
      },
      async authHandoffPage(sessionId) {
        return fetchText(`${url}/handoff/${encodeURIComponent(String(sessionId || ''))}`, {}, 5000);
      },
      async authSnapshot(sessionId, claimToken) {
        return fetchJson(`${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId || ''))}/snapshot`, {
          headers: { 'x-evercraft-browser-claim': String(claimToken || '') },
        }, 10_000);
      },
      async authAction(sessionId, claimToken, action) {
        return fetchJson(`${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId || ''))}/action`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-evercraft-browser-claim': String(claimToken || ''),
          },
          body: JSON.stringify(action || {}),
        }, 35_000);
      },
      async authDelegate(sessionId, claimToken, policy = {}) {
        return fetchJson(`${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId || ''))}/delegate`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-evercraft-browser-claim': String(claimToken || ''),
          },
          body: JSON.stringify(policy || {}),
        }, 10_000);
      },
      async authRevokeDelegation(sessionId, claimToken) {
        return fetchJson(`${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId || ''))}/delegate`, {
          method: 'DELETE',
          headers: {
            'x-evercraft-browser-claim': String(claimToken || ''),
          },
        }, 10_000);
      },
      async delegatedSnapshot(sessionId) {
        return fetchJson(`${url}/v1/auth-browser/delegated/${encodeURIComponent(String(sessionId || ''))}/snapshot`, {
          headers: {
            authorization: `Bearer ${authOperatorToken}`,
          },
        }, 10_000);
      },
      async delegatedAction(sessionId, action) {
        return fetchJson(`${url}/v1/auth-browser/delegated/${encodeURIComponent(String(sessionId || ''))}/action`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${authOperatorToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(action || {}),
        }, 35_000);
      },
      async authClose(sessionId, claimToken) {
        return fetchJson(`${url}/v1/auth-browser/sessions/${encodeURIComponent(String(sessionId || ''))}`, {
          method: 'DELETE',
          headers: { 'x-evercraft-browser-claim': String(claimToken || '') },
        }, 10_000);
      },
      setDeploymentReceipt(receiptRef) {
        deploymentReceiptRef = String(receiptRef || '');
        return {
          ok: true,
          service: 'evercraft-owned-browser-worker',
          runtime: 'Evercraft Compute',
          instance_id: instanceId,
          deployment_receipt_ref: deploymentReceiptRef || null,
        };
      },
      async close() {},
    };

    const publicAdapter = await startBrowserPublicAdapter({
      runtime,
      host:'127.0.0.1',
      port:0,
      maxRequestsPerMinute:120,
    });

    runtime.localPublicUrl = publicAdapter.url;
    runtime.publicAdapterHealth = publicAdapter.health;
    runtime.close = async () => {
      if (closed) return;
      closed = true;
      try { await publicAdapter.close(); } catch {}
      try {
        command('docker', ['rm', '-f', containerId], { timeout: 15_000 });
      } catch {}
    };

    return runtime;
  } catch (error) {
    try {
      command('docker', ['rm', '-f', containerId], { timeout: 15_000 });
    } catch {}
    throw error;
  }
}
