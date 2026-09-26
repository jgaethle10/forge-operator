import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
} = {}) {
  const root = path.resolve(String(sourceDir || ''));
  if (!root) throw new Error('browser_worker_source_dir_required');
  if (!browserContainerAvailable()) throw new Error('browser_container_runtime_unavailable');

  const sourceFingerprint = crypto
    .createHash('sha256')
    .update(root)
    .digest('hex')
    .slice(0, 12);
  const image = String(imageTag || `evercraft/browser-worker:yard-${sourceFingerprint}`);
  command('docker', ['build', '-q', '-t', image, root], { timeout: buildTimeoutMs });

  const workerToken = crypto.randomBytes(32).toString('hex');
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

    return {
      url,
      instanceId,
      image,
      containerId,
      initialHealth,
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
      async close() {
        if (closed) return;
        closed = true;
        try {
          command('docker', ['rm', '-f', containerId], { timeout: 15_000 });
        } catch {}
      },
    };
  } catch (error) {
    try {
      command('docker', ['rm', '-f', containerId], { timeout: 15_000 });
    } catch {}
    throw error;
  }
}
