import { emptyState, ingestObservation } from './engine.mjs';

const LEVEL_SCORE = {
  none: -1,
  watch: 0,
  corroborating: 1,
  elevated: 2,
  urgent: 3
};

function ms(value) {
  return new Date(value).getTime();
}

export function replayObservations(events, options = {}) {
  const ordered = [...events].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  let state = emptyState();
  const trace = [];
  let maxLevel = 'none';
  let firstAlertAt = null;
  let firstElevatedAt = null;
  let firstUrgentAt = null;
  let falseElevations = 0;

  for (const event of ordered) {
    const expectedHazard = event.expected_hazard === true;
    const observation = { ...event };
    delete observation.expected_hazard;

    const result = ingestObservation(state, observation, options.engine || {});
    state = result.state;
    const level = result.decision.assessment.level;

    if (LEVEL_SCORE[level] > LEVEL_SCORE[maxLevel]) maxLevel = level;
    if (!firstAlertAt && LEVEL_SCORE[level] >= LEVEL_SCORE.corroborating) {
      firstAlertAt = observation.created_at;
    }
    if (!firstElevatedAt && LEVEL_SCORE[level] >= LEVEL_SCORE.elevated) {
      firstElevatedAt = observation.created_at;
    }
    if (!firstUrgentAt && level === 'urgent') {
      firstUrgentAt = observation.created_at;
    }
    if (!expectedHazard && LEVEL_SCORE[level] >= LEVEL_SCORE.elevated) {
      falseElevations += 1;
    }

    trace.push({
      observation_id: observation.observation_id,
      created_at: observation.created_at,
      expected_hazard: expectedHazard,
      level,
      confidence: result.decision.assessment.confidence,
      action: result.decision.action
    });
  }

  const referenceHazardAt = options.reference_hazard_at || null;
  const warningLeadSeconds = (
    referenceHazardAt && firstAlertAt
      ? Math.max(0, (ms(referenceHazardAt) - ms(firstAlertAt)) / 1000)
      : null
  );

  return {
    schema: 'systemia.sentinel.replay.v1',
    observations: ordered.length,
    max_level: maxLevel,
    first_alert_at: firstAlertAt,
    first_elevated_at: firstElevatedAt,
    first_urgent_at: firstUrgentAt,
    reference_hazard_at: referenceHazardAt,
    warning_lead_seconds: warningLeadSeconds,
    false_elevations: falseElevations,
    trace
  };
}

export function compareReplayRuns(runs) {
  const comparable = runs.filter((run) => Number.isFinite(run?.warning_lead_seconds));
  return {
    schema: 'systemia.sentinel.replay-comparison.v1',
    run_count: runs.length,
    measured_warning_runs: comparable.length,
    mean_warning_lead_seconds: comparable.length
      ? Math.round(comparable.reduce((sum, run) => sum + run.warning_lead_seconds, 0) / comparable.length)
      : null,
    total_false_elevations: runs.reduce((sum, run) => sum + (run.false_elevations || 0), 0)
  };
}
