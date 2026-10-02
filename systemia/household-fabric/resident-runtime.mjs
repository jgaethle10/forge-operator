import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyLedger } from './ingest.mjs';
import {
  executeYakimaHouseholdCycle,
  fetchYakimaBrowserResult,
  loadJson,
  providerConfigFromEnvironment,
  writeYakimaHouseholdArtifacts,
} from '../organism/household-fabric-yakima-runner.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function safeCycleErrorCode(error) {
  const message = clean(error?.message || error).toLowerCase();
  if (message.includes('browser')) return 'browser_collection_failed';
  if (message.includes('credential') || message.includes('vault')) return 'credential_resolution_failed';
  if (message.includes('google')) return 'google_provider_failed';
  if (message.includes('kroger')) return 'kroger_provider_failed';
  return 'household_fabric_cycle_failed';
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

export async function startHouseholdFabricYakimaRuntime({
  stateDir,
  browserEdgeUrl = '',
  browserToken = '',
  cadenceSeconds = 300,
  host = '127.0.0.1',
  port = 0,
  env = process.env,
  fetchImpl = fetch,
  browserResultProvider = null,
  runImmediately = true,
} = {}) {
  if (!stateDir) throw new Error('household_fabric_state_dir_required');
  const root = path.resolve(stateDir);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);

  const cadence = Math.max(60, Number(cadenceSeconds || 300));
  const instanceId = 'household_' + randomUUID();
  const ledgerFile = path.join(root, 'ledger.json');
  const stateFile = path.join(root, 'state.json');
  const todayFile = path.join(root, 'today.json');

  let closed = false;
  let inFlight = false;
  let timer = null;
  let lastAttemptAt = null;
  let lastSuccessAt = null;
  let lastError = null;
  let lastCycle = null;
  let credentialStatus = null;

  async function runCycle() {
    if (closed || inFlight) return { ok: false, state: closed ? 'closed' : 'cycle_in_progress' };
    inFlight = true;
    lastAttemptAt = new Date().toISOString();
    try {
      const browserResult = typeof browserResultProvider === 'function'
        ? await browserResultProvider()
        : await fetchYakimaBrowserResult(browserEdgeUrl, browserToken, fetchImpl);

      const providerConfig = providerConfigFromEnvironment(env);
      credentialStatus = providerConfig.credential_status;
      const report = await executeYakimaHouseholdCycle({
        browserResult,
        ledger: loadJson(ledgerFile, emptyLedger()),
        previousState: loadJson(stateFile, null),
        now: new Date(),
        google: providerConfig.google,
        kroger: providerConfig.kroger,
        priceOptions: providerConfig.priceOptions,
        fetchImpl,
      });
      report.credential_status = credentialStatus;
      writeYakimaHouseholdArtifacts(root, report);
      lastCycle = report;
      lastSuccessAt = new Date().toISOString();
      lastError = null;
      return {
        ok: true,
        state: report.today?.status || 'degraded',
        cycle_key: report.cycle_key,
        material_change: report.material_change,
      };
    } catch (error) {
      lastError = safeCycleErrorCode(error);
      return { ok: false, state: 'held', error: lastError };
    } finally {
      inFlight = false;
    }
  }

  function health() {
    const todayAvailable = fs.existsSync(todayFile);
    const sourceStates = Array.isArray(lastCycle?.price_sources)
      ? lastCycle.price_sources.map(row => ({
          source: row.source,
          state: row.state,
        }))
      : [];
    const state = closed
      ? 'closed'
      : inFlight
        ? 'running_cycle'
        : lastError
          ? 'held'
          : todayAvailable
            ? (lastCycle?.today?.status || 'degraded')
            : 'starting';

    return {
      ok: !closed,
      service: 'household-fabric-yakima',
      runtime: 'Evercraft Compute',
      workload_class: 'systemia.household-fabric-yakima.v1',
      instance_id: instanceId,
      state,
      cadence_seconds: cadence,
      resident_process_alive: !closed,
      cycle_in_flight: inFlight,
      browser_edge_configured: Boolean(clean(browserEdgeUrl) || typeof browserResultProvider === 'function'),
      today_available: todayAvailable,
      today_path: todayAvailable ? '/today' : null,
      last_attempt_at: lastAttemptAt,
      last_success_at: lastSuccessAt,
      last_cycle_key: lastCycle?.cycle_key || null,
      last_material_change: lastCycle?.material_change ?? null,
      today_status: lastCycle?.today?.status || null,
      degraded_categories: lastCycle?.today?.coverage?.degraded_categories || [],
      price_source_states: sourceStates,
      credential_status: credentialStatus,
      secret_material_exposed: false,
      raw_provider_secrets_required: false,
      poverty_score_used: false,
      sponsorship_affects_rank: false,
      last_error: lastError,
    };
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, health());
    }
    if (req.method === 'GET' && req.url === '/today') {
      if (!fs.existsSync(todayFile)) {
        return json(res, 503, {
          ok: false,
          error: 'household_fabric_today_unavailable',
          state: health().state,
        });
      }
      try {
        return json(res, 200, {
          ok: true,
          ...JSON.parse(fs.readFileSync(todayFile, 'utf8')),
        });
      } catch {
        return json(res, 503, {
          ok: false,
          error: 'household_fabric_today_unreadable',
        });
      }
    }
    return json(res, 404, { ok: false, error: 'not_found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  if (runImmediately) {
    runCycle().catch(() => {});
  }
  timer = setInterval(() => {
    runCycle().catch(() => {});
  }, cadence * 1000);
  timer.unref?.();

  async function close() {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }

  return {
    instanceId,
    url,
    stateDir: root,
    runCycle,
    health,
    close,
  };
}
