import fs from 'node:fs';
import path from 'node:path';
import {
  buildFaieInvestigation,
  emptyFaieState,
  ingestFaieObservation,
  publicFaieSnapshot
} from './core.mjs';
import { collectFaieOfficialSources, faieCollectorConfigFromEnv } from './collectors.mjs';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n');
}

function truthToEvidence(signal = {}) {
  const truth = String(signal.truth_state || '').toUpperCase();
  if (truth === 'CORROBORATED') return 'verified';
  if (truth === 'OBSERVED' || truth === 'CLOSED') return 'observed';
  if (truth === 'INFERRED') return 'modeled';
  return 'reported';
}

function radarSignalToObservation(signal = {}) {
  return {
    observation_id: signal.observation_id || ('radar:' + signal.signal_id),
    source_system: 'systemia_radar',
    source_family: signal.source_family || 'Systemia Radar',
    observed_at: signal.observed_at || signal.last_verified_at || new Date().toISOString(),
    region_keys: Array.isArray(signal.region_keys) && signal.region_keys.length ? signal.region_keys : ['global'],
    domains: Array.isArray(signal.domains) && signal.domains.length ? signal.domains : ['general'],
    kind: signal.kind || 'radar_signal',
    evidence_state: truthToEvidence(signal),
    reliability: Number.isFinite(Number(signal.reliability)) ? Number(signal.reliability) : 0.6,
    anomaly_score: Number.isFinite(Number(signal.materiality_score))
      ? Number(signal.materiality_score)
      : Number(signal.anomaly_score || 0),
    summary: signal.summary || '',
    provenance_refs: Array.isArray(signal.provenance_refs) ? signal.provenance_refs : [],
    correlation_keys: Array.isArray(signal.correlation_keys) ? signal.correlation_keys : [],
    facts: {
      radar_signal_id: signal.signal_id,
      radar_truth_state: signal.truth_state,
      radar_change_state: signal.change_state,
      radar_materiality_score: signal.materiality_score
    },
    metadata: {
      bridge: 'faie_radar_bridge'
    }
  };
}

export function investigationToMarkdown(investigation) {
  if (!investigation) return '';
  const lines = [
    '# FAIE Investigation',
    '',
    '**Question:** ' + investigation.scope.question,
    '',
    '**Status:** ' + investigation.status,
    '',
    '**Confidence:** ' + investigation.confidence,
    '',
    investigation.summary,
    '',
    '## Findings',
    ''
  ];

  if (!investigation.findings.length) {
    lines.push('No matching evidence cleared the investigation gate.', '');
  } else {
    investigation.findings.forEach((finding, index) => {
      lines.push(
        '### ' + (index + 1) + '. ' + finding.summary,
        '',
        '- Evidence state: ' + finding.evidence_state,
        '- Source family: ' + finding.source_family,
        '- Observed: ' + finding.observed_at,
        '- Dimensions: ' + finding.dimensions.join(', '),
        '- Regions: ' + finding.region_keys.join(', '),
        '- Signal score: ' + finding.signal_score,
        '- Relevance score: ' + finding.relevance_score,
        ''
      );
      if (finding.provenance_refs.length) {
        lines.push('Provenance:', '');
        finding.provenance_refs.forEach((ref) => lines.push('- ' + ref));
        lines.push('');
      }
    });
  }

  lines.push('## Unknowns', '');
  investigation.unknowns.forEach((item) => lines.push('- ' + item));
  lines.push('', '## Evidence needed', '');
  investigation.evidence_needed.forEach((item) => lines.push('- ' + item));
  lines.push('', '## Boundaries', '');
  investigation.boundaries.forEach((item) => lines.push('- ' + item));
  lines.push('');
  return lines.join('\n');
}

export function createFaieRuntime({
  stateDir = path.resolve('.runtime', 'faie'),
  intervalMs = Number(process.env.FAIE_INTERVAL_MS || 5 * 60 * 1000),
  radarResident = null,
  fetchImpl = globalThis.fetch,
  collectorConfig = faieCollectorConfigFromEnv()
} = {}) {
  ensureDir(stateDir);
  const stateFile = path.join(stateDir, 'state.json');
  const publicFile = path.join(stateDir, 'public-latest.json');
  const receiptsFile = path.join(stateDir, 'receipts.jsonl');
  const investigationsDir = path.join(stateDir, 'investigations');

  let state = readJson(stateFile, emptyFaieState());
  let timer = null;
  let running = false;

  function persist() {
    writeJson(stateFile, state);
    writeJson(publicFile, publicFaieSnapshot(state));
  }

  function ingest(observation, options = {}) {
    const result = ingestFaieObservation(state, observation, options);
    state = result.state;
    if (result.decision?.receipt) appendJsonl(receiptsFile, result.decision.receipt);
    if (result.decision?.action === 'admitted') persist();
    return result.decision;
  }

  function preview(input, options = {}) {
    return buildFaieInvestigation(state, input, options).investigation;
  }
  function investigate(input, options = {}) {
    const result = buildFaieInvestigation(state, input, options);
    state = result.state;
    persist();
    appendJsonl(receiptsFile, result.receipt);
    ensureDir(investigationsDir);
    const safeId = result.investigation.investigation_id.replace(/[^a-zA-Z0-9._-]/g, '_');
    writeJson(path.join(investigationsDir, safeId + '.json'), result.investigation);
    fs.writeFileSync(
      path.join(investigationsDir, safeId + '.md'),
      investigationToMarkdown(result.investigation)
    );
    return result.investigation;
  }

  function latestInvestigations(limit = 20) {
    return Object.values(state.investigations || {})
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  }

  function getInvestigation(id) {
    return state.investigations?.[String(id || '')] || null;
  }

  function snapshot(limit = 50) {
    return publicFaieSnapshot(state, { limit });
  }

  function health() {
    return {
      schema: 'evercraft.faie.health.v1',
      ok: true,
      resident: Boolean(timer),
      running,
      interval_ms: intervalMs,
      signal_count: Object.keys(state.signals || {}).length,
      observation_count: Object.keys(state.observations || {}).length,
      investigation_count: Object.keys(state.investigations || {}).length,
      radar_bridge: Boolean(radarResident),
      last_cycle: state.last_cycle || null,
      decision_authority: false,
      publication_authority: false
    };
  }

  async function runOnce({ externalObservations = [] } = {}) {
    if (running) {
      return {
        schema: 'evercraft.faie.cycle-receipt.v1',
        status: 'skipped',
        reason: 'cycle_already_running',
        created_at: new Date().toISOString()
      };
    }

    running = true;
    const startedAt = new Date().toISOString();
    let admitted = 0;
    let deduped = 0;
    let ignored = 0;
    let radarSignalsSeen = 0;
    const errors = [];

    try {
      let officialCollectorRun = { observations: [], receipts: [] };
      try {
        officialCollectorRun = await collectFaieOfficialSources({
          fetchImpl,
          checkedAt: startedAt,
          config: collectorConfig
        });
      } catch (error) {
        errors.push('official_collectors: ' + (error instanceof Error ? error.message : String(error)));
      }

      const observations = [
        ...(officialCollectorRun.observations || []),
        ...externalObservations
      ];

      if (radarResident && typeof radarResident.latest === 'function') {
        try {
          const latest = radarResident.latest();
          const radarSignals = Array.isArray(latest?.signals) ? latest.signals : [];
          radarSignalsSeen = radarSignals.length;
          observations.push(...radarSignals.map(radarSignalToObservation));
        } catch (error) {
          errors.push('radar_bridge: ' + (error instanceof Error ? error.message : String(error)));
        }
      }

      for (const observation of observations) {
        try {
          const decision = ingest(observation);
          if (decision.action === 'admitted') admitted += 1;
          else if (decision.action === 'deduped') deduped += 1;
          else ignored += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      const finishedAt = new Date().toISOString();
      const receipt = {
        schema: 'evercraft.faie.cycle-receipt.v1',
        status: errors.length ? 'partial' : 'ok',
        started_at: startedAt,
        finished_at: finishedAt,
        radar_signals_seen: radarSignalsSeen,
        official_observations_seen: officialCollectorRun.observations?.length || 0,
        official_collector_receipts: officialCollectorRun.receipts || [],
        external_observations_seen: externalObservations.length,
        admitted,
        deduped,
        ignored,
        errors,
        publication_authority: false,
        decision_authority: false
      };
      state.last_cycle = receipt;
      appendJsonl(receiptsFile, receipt);
      persist();
      return receipt;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    runOnce().catch(() => {});
    timer = setInterval(() => {
      runOnce().catch(() => {});
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  persist();

  return {
    ingest,
    preview,
    investigate,
    latestInvestigations,
    getInvestigation,
    snapshot,
    health,
    runOnce,
    start,
    stop,
    markdown: investigationToMarkdown
  };
}
