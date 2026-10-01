import fs from 'node:fs';
import path from 'node:path';
import { runOfficialCollectors } from './collectors.mjs';
import {
  compileRadarEdition,
  emptyRadarState,
  ingestRadarObservation,
  publicRadarProjection
} from './core.mjs';
import { buildRadarSocialDraft, radarEditionToEditorialPacket } from './journal-bridge.mjs';

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
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

export function createRadarResident({
  stateDir = path.resolve('.runtime', 'radar'),
  fetchImpl = globalThis.fetch,
  intervalMs = 5 * 60 * 1000,
  materialityThreshold = 0.58,
  maxSignals = 8,
  journalUrl = '',
  clock = () => new Date()
} = {}) {
  const stateFile = path.join(stateDir, 'state.json');
  const latestFile = path.join(stateDir, 'latest-edition.json');
  const publicFile = path.join(stateDir, 'public-latest.json');
  const journalPacketFile = path.join(stateDir, 'journal-editorial-packet.json');
  const linkedinDraftFile = path.join(stateDir, 'linkedin-draft.json');
  const facebookDraftFile = path.join(stateDir, 'facebook-draft.json');
  const receiptsFile = path.join(stateDir, 'receipts.jsonl');

  let state = readJson(stateFile, emptyRadarState());
  let timer = null;
  let running = false;
  let lastRun = null;
  let lastError = null;

  async function runOnce({ externalObservations = [] } = {}) {
    if (running) {
      return {
        schema: 'evercraft.systemia-radar.run-receipt.v1',
        status: 'skipped',
        reason: 'cycle_already_running',
        at: clock().toISOString()
      };
    }

    running = true;
    const startedAt = clock().toISOString();
    try {
      const collectorRun = await runOfficialCollectors({
        fetchImpl,
        now: startedAt
      });

      const observations = [
        ...(collectorRun.observations || []),
        ...(Array.isArray(externalObservations) ? externalObservations : [])
      ];

      const ingestReceipts = [];
      for (const observation of observations) {
        const result = ingestRadarObservation(state, observation, { now: startedAt });
        state = result.state;
        if (result.decision?.receipt) ingestReceipts.push(result.decision.receipt);
      }

      const compiled = compileRadarEdition(state, {
        now: startedAt,
        materiality_threshold: materialityThreshold,
        max_signals: maxSignals
      });
      state = compiled.state;

      const edition = compiled.edition;
      const publicEdition = publicRadarProjection(edition);
      const journalPacket = radarEditionToEditorialPacket(edition);
      const linkedinDraft = buildRadarSocialDraft(edition, {
        platform: 'linkedin',
        journal_url: journalUrl
      });
      const facebookDraft = buildRadarSocialDraft(edition, {
        platform: 'facebook',
        journal_url: journalUrl
      });

      atomicWrite(stateFile, state);
      atomicWrite(latestFile, edition);
      atomicWrite(publicFile, publicEdition);
      atomicWrite(journalPacketFile, journalPacket);
      atomicWrite(linkedinDraftFile, linkedinDraft);
      atomicWrite(facebookDraftFile, facebookDraft);

      const receipt = {
        schema: 'evercraft.systemia-radar.run-receipt.v1',
        status: 'pass',
        started_at: startedAt,
        finished_at: clock().toISOString(),
        collected_observations: collectorRun.observations?.length || 0,
        external_observations: Array.isArray(externalObservations) ? externalObservations.length : 0,
        admitted_observations: ingestReceipts.length,
        collector_receipts: collectorRun.receipts,
        edition_id: edition.edition_id,
        edition_status: edition.status,
        signal_count: edition.signal_count,
        publication_authority: false
      };
      appendJsonl(receiptsFile, receipt);
      lastRun = receipt;
      lastError = null;
      return receipt;
    } catch (error) {
      const receipt = {
        schema: 'evercraft.systemia-radar.run-receipt.v1',
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

  function ingest(observation) {
    const now = clock().toISOString();
    const result = ingestRadarObservation(state, observation, { now });
    state = result.state;
    atomicWrite(stateFile, state);
    if (result.decision?.receipt) appendJsonl(receiptsFile, result.decision.receipt);
    return result.decision;
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
      schema: 'evercraft.systemia-radar.health.v1',
      ok: !lastError,
      running,
      resident: Boolean(timer),
      interval_ms: intervalMs,
      state_dir: stateDir,
      observation_count: Object.keys(state.observations || {}).length,
      stream_count: Object.keys(state.streams || {}).length,
      latest_edition_id: state.last_edition?.edition_id || null,
      latest_signal_count: state.last_edition?.signal_count || 0,
      last_run: lastRun,
      last_error: lastError,
      publication_authority: false
    };
  }

  function latest() {
    return publicRadarProjection(state.last_edition);
  }

  function internalLatest() {
    return state.last_edition ? structuredClone(state.last_edition) : null;
  }

  return {
    runOnce,
    ingest,
    start,
    stop,
    health,
    latest,
    internalLatest
  };
}
