import fs from 'node:fs';
import path from 'node:path';
import {
  addEvidenceToDossier,
  admitRadarEdition,
  compileTowiDesk,
  editorialPacketForDossier,
  emptyTowiState,
  publicTowiProjection
} from './core.mjs';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function atomicWrite(file, value) {
  ensureDir(path.dirname(file));
  const temp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

export function createTowiResident({
  radarResident = null,
  stateDir = path.resolve('.runtime', 'towi'),
  intervalMs = 5 * 60 * 1000,
  maxItems = 24,
  clock = () => new Date()
} = {}) {
  const stateFile = path.join(stateDir, 'state.json');
  const latestFile = path.join(stateDir, 'latest-desk.json');
  const publicFile = path.join(stateDir, 'public-latest.json');
  const editorialFile = path.join(stateDir, 'editorial-queue.json');
  const receiptsFile = path.join(stateDir, 'receipts.jsonl');

  let state = readJson(stateFile, emptyTowiState());
  let timer = null;
  let running = false;
  let lastRun = null;
  let lastError = null;

  async function runOnce({ radarEdition = null } = {}) {
    if (running) {
      return {
        schema: 'evercraft.towi.run-receipt.v1',
        status: 'skipped',
        reason: 'cycle_already_running',
        at: clock().toISOString(),
        publication_authority: false
      };
    }

    running = true;
    const startedAt = clock().toISOString();
    try {
      const edition = radarEdition || radarResident?.internalLatest?.() || null;
      const admitted = admitRadarEdition(state, edition, { now: startedAt });
      state = admitted.state;
      const compiled = compileTowiDesk(state, { now: startedAt, max_items: maxItems });
      state = compiled.state;

      const publicDesk = publicTowiProjection(compiled.desk);
      const editorialQueue = (compiled.desk.dossiers || [])
        .map((dossier) => editorialPacketForDossier(dossier))
        .filter(Boolean);

      atomicWrite(stateFile, state);
      atomicWrite(latestFile, compiled.desk);
      atomicWrite(publicFile, publicDesk);
      atomicWrite(editorialFile, {
        schema: 'evercraft.towi.editorial-queue.v1',
        generated_at: startedAt,
        packets: editorialQueue,
        publication_authority: false
      });

      const receipt = {
        schema: 'evercraft.towi.run-receipt.v1',
        status: 'pass',
        started_at: startedAt,
        finished_at: clock().toISOString(),
        radar_edition_id: edition?.edition_id || null,
        ingest_status: admitted.receipt?.status || 'quiet',
        dossier_count: compiled.desk.dossier_count,
        editorial_candidate_count: compiled.desk.editorial_candidate_count,
        watch_count: compiled.desk.watch_count,
        aftermath_count: compiled.desk.aftermath_count,
        publication_authority: false
      };
      appendJsonl(receiptsFile, receipt);
      lastRun = receipt;
      lastError = null;
      return receipt;
    } catch (error) {
      const receipt = {
        schema: 'evercraft.towi.run-receipt.v1',
        status: 'failed',
        started_at: startedAt,
        finished_at: clock().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        publication_authority: false
      };
      appendJsonl(receiptsFile, receipt);
      lastRun = receipt;
      lastError = receipt.error;
      return receipt;
    } finally {
      running = false;
    }
  }

  function addEvidence(dossierId, evidence) {
    const now = clock().toISOString();
    const added = addEvidenceToDossier(state, dossierId, evidence, { now });
    state = added.state;
    const compiled = compileTowiDesk(state, { now, max_items: maxItems });
    state = compiled.state;

    atomicWrite(stateFile, state);
    atomicWrite(latestFile, compiled.desk);
    atomicWrite(publicFile, publicTowiProjection(compiled.desk));
    atomicWrite(editorialFile, {
      schema: 'evercraft.towi.editorial-queue.v1',
      generated_at: now,
      packets: (compiled.desk.dossiers || []).map((dossier) => editorialPacketForDossier(dossier)).filter(Boolean),
      publication_authority: false
    });
    appendJsonl(receiptsFile, added.receipt);
    return added.receipt;
  }

  function start() {
    if (timer) return;
    runOnce().catch(() => {});
    timer = setInterval(() => {
      runOnce().catch(() => {});
    }, Math.max(60_000, Number(intervalMs) || 5 * 60 * 1000));
    timer.unref?.();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function health() {
    return {
      schema: 'evercraft.towi.health.v1',
      ok: !lastError,
      running,
      resident: Boolean(timer),
      interval_ms: intervalMs,
      state_dir: stateDir,
      dossier_count: Object.keys(state.dossiers || {}).length,
      latest_generated_at: state.last_desk?.generated_at || null,
      editorial_candidate_count: state.last_desk?.editorial_candidate_count || 0,
      watch_count: state.last_desk?.watch_count || 0,
      aftermath_count: state.last_desk?.aftermath_count || 0,
      last_run: lastRun,
      last_error: lastError,
      publication_authority: false
    };
  }

  function latest() {
    return publicTowiProjection(state.last_desk);
  }

  function queue() {
    return state.last_desk ? structuredClone(state.last_desk.dossiers || []) : [];
  }

  function dossier(id) {
    const row = state.dossiers?.[String(id || '')] || null;
    return row ? structuredClone(row) : null;
  }

  return {
    runOnce,
    addEvidence,
    start,
    stop,
    health,
    latest,
    queue,
    dossier
  };
}
