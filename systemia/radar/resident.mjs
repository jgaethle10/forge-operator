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
import { emptySourceHealthState, publicSourceHealthProjection, updateSourceHealth } from './source-health.mjs';
import {
  buildRadarRelease,
  listRadarCorrections,
  listRadarReleases,
  persistRadarRelease,
  readRadarRelease,
  reconcileRadarCorrections
} from './release-controller.mjs';
import { readSentinelRadarBridge } from './sentinel-bridge.mjs';

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
  autoReleaseOwned = false,
  sentinelStateDir = path.resolve('artifacts', 'sentinel-resident'),
  sentinelBridgeEnabled = true,
  sentinelMaxAgeSeconds = 180,
  clock = () => new Date()
} = {}) {
  const stateFile = path.join(stateDir, 'state.json');
  const latestFile = path.join(stateDir, 'latest-edition.json');
  const publicFile = path.join(stateDir, 'public-latest.json');
  const journalPacketFile = path.join(stateDir, 'journal-editorial-packet.json');
  const linkedinDraftFile = path.join(stateDir, 'linkedin-draft.json');
  const facebookDraftFile = path.join(stateDir, 'facebook-draft.json');
  const receiptsFile = path.join(stateDir, 'receipts.jsonl');
  const sourceHealthFile = path.join(stateDir, 'source-health.json');
  const publicSourceHealthFile = path.join(stateDir, 'public-source-health.json');
  const releaseCandidateFile = path.join(stateDir, 'release-candidate.json');

  let state = readJson(stateFile, emptyRadarState());
  let sourceHealthState = readJson(sourceHealthFile, emptySourceHealthState());
  let timer = null;
  let running = false;
  let lastRun = null;
  let lastError = null;
  let lastReleaseDecision = readJson(releaseCandidateFile, null);
  let lastSentinelBridge = null;

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

      const sentinelBridge = sentinelBridgeEnabled
        ? readSentinelRadarBridge({
            stateDir: sentinelStateDir,
            now: startedAt,
            maxAgeSeconds: sentinelMaxAgeSeconds
          })
        : {
            schema: 'evercraft.systemia-radar.upstream-bridge-receipt.v1',
            bridge: 'systemia-sentinel',
            status: 'disabled',
            checked_at: startedAt,
            observation_count: 0,
            batch: null
          };
      lastSentinelBridge = sentinelBridge;

      const sourceReceipts = [...(collectorRun.receipts || [])];
      if (['pass', 'failed'].includes(sentinelBridge.status)) {
        sourceReceipts.push({
          collector: 'systemia-sentinel-bridge',
          status: sentinelBridge.status,
          observation_count: sentinelBridge.observation_count || 0,
          error: sentinelBridge.error || null,
          started_at: startedAt,
          finished_at: startedAt
        });
      }

      const sourceHealthUpdate = updateSourceHealth(sourceHealthState, sourceReceipts, {
        at: startedAt
      });
      sourceHealthState = sourceHealthUpdate.state;

      const observations = [
        ...(collectorRun.observations || []),
        ...(sentinelBridge.batch?.observations || []),
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

      const correctionRun = reconcileRadarCorrections({
        stateDir,
        radarState: state,
        currentEdition: edition,
        at: startedAt
      });
      const releaseDecision = buildRadarRelease({
        edition,
        editorialPacket: journalPacket,
        socialDrafts: [linkedinDraft, facebookDraft]
      });
      lastReleaseDecision = releaseDecision;
      let ownedReleaseReceipt = null;
      if (releaseDecision.status === 'ready' && autoReleaseOwned) {
        ownedReleaseReceipt = persistRadarRelease({
          stateDir,
          release: releaseDecision.release,
          at: startedAt
        });
      }

      atomicWrite(stateFile, state);
      atomicWrite(latestFile, edition);
      atomicWrite(publicFile, publicEdition);
      atomicWrite(journalPacketFile, journalPacket);
      atomicWrite(linkedinDraftFile, linkedinDraft);
      atomicWrite(facebookDraftFile, facebookDraft);
      atomicWrite(sourceHealthFile, sourceHealthState);
      atomicWrite(publicSourceHealthFile, publicSourceHealthProjection(sourceHealthState));
      atomicWrite(releaseCandidateFile, releaseDecision);

      const receipt = {
        schema: 'evercraft.systemia-radar.run-receipt.v1',
        status: 'pass',
        started_at: startedAt,
        finished_at: clock().toISOString(),
        collected_observations: collectorRun.observations?.length || 0,
        sentinel_bridge: sentinelBridge,
        sentinel_observations: sentinelBridge.batch?.observations?.length || 0,
        external_observations: Array.isArray(externalObservations) ? externalObservations.length : 0,
        admitted_observations: ingestReceipts.length,
        collector_receipts: collectorRun.receipts,
        upstream_bridge_receipts: [sentinelBridge],
        edition_id: edition.edition_id,
        edition_status: edition.status,
        signal_count: edition.signal_count,
        propagation_candidate_count: edition.propagation_candidates?.length || 0,
        rolled_off_count: edition.rolled_off_count || 0,
        source_health: sourceHealthUpdate.summary,
        release_gate_status: releaseDecision.status,
        owned_release: ownedReleaseReceipt,
        correction_run: correctionRun,
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
      propagation_candidate_count: state.last_edition?.propagation_candidates?.length || 0,
      source_health: publicSourceHealthProjection(sourceHealthState),
      upstream_bridges: {
        sentinel: lastSentinelBridge
      },
      release_gate_status: lastReleaseDecision?.status || 'not_evaluated',
      owned_release_count: listRadarReleases(stateDir).releases?.length || 0,
      correction_count: listRadarCorrections(stateDir).corrections?.length || 0,
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

  function sourceHealth() {
    return publicSourceHealthProjection(sourceHealthState);
  }

  function releaseLatestOwned() {
    if (!lastReleaseDecision || lastReleaseDecision.status !== 'ready' || !lastReleaseDecision.release) {
      return {
        schema: 'evercraft.systemia-radar.release-write.v1',
        status: 'hold',
        reason: 'latest_release_candidate_not_ready',
        gate: lastReleaseDecision?.gate || null
      };
    }
    return persistRadarRelease({
      stateDir,
      release: lastReleaseDecision.release,
      at: clock().toISOString()
    });
  }

  function releaseState() {
    const index = listRadarReleases(stateDir);
    const latestRow = index.releases?.[0] || null;
    return {
      schema: 'evercraft.systemia-radar.release-state.v1',
      auto_release_owned: Boolean(autoReleaseOwned),
      latest_candidate: lastReleaseDecision,
      index,
      latest_release: latestRow ? readRadarRelease(stateDir, latestRow.slug) : null,
      corrections: listRadarCorrections(stateDir)
    };
  }

  return {
    runOnce,
    ingest,
    start,
    stop,
    health,
    latest,
    internalLatest,
    sourceHealth,
    releaseLatestOwned,
    releaseState
  };
}
