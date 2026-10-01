export const JOURNAL_CONSUMER = 'journal';

const clean = (value) => String(value ?? '').trim();
const clamp01 = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

export function assessJournalDispatch({ dispatch, observation } = {}) {
  if (!dispatch || dispatch.consumer !== JOURNAL_CONSUMER) {
    return { action: 'ignore', reason: 'not_journal_consumer', candidate: null };
  }
  if (!observation) {
    return { action: 'hold', reason: 'observation_missing', candidate: null };
  }

  const provenance = [...new Set((observation.provenance_refs || []).map(clean).filter(Boolean))];
  if (!provenance.length) {
    return { action: 'hold', reason: 'source_lineage_missing', candidate: null };
  }

  const evidenceState = clean(observation.evidence_state).toLowerCase();
  if (!['reported', 'observed', 'verified'].includes(evidenceState)) {
    return { action: 'hold', reason: 'unsupported_evidence_state', candidate: null };
  }

  const anomaly = clamp01(observation.anomaly_score, 0);
  const reliability = clamp01(observation.reliability, 0.5);
  const priorityBonus = dispatch.priority === 'high' ? 0.2 : dispatch.priority === 'normal' ? 0.08 : 0;
  const editorialSignal = Math.min(1, 0.55 * anomaly + 0.35 * reliability + priorityBonus);

  if (editorialSignal < 0.52) {
    return {
      action: 'background',
      reason: 'below_material_editorial_threshold',
      editorial_signal: Number(editorialSignal.toFixed(3)),
      candidate: null
    };
  }

  return {
    action: 'candidate',
    reason: 'material_source_grounded_signal',
    editorial_signal: Number(editorialSignal.toFixed(3)),
    candidate: {
      schema: 'evercraft.journal.signal-candidate.v1',
      candidate_id: `journal-candidate:${observation.observation_id}`,
      observation_id: observation.observation_id,
      observed_at: observation.observed_at,
      domains: observation.domains || [],
      region_keys: observation.region_keys || [],
      summary: clean(observation.summary),
      source_family: observation.source_family,
      evidence_state: evidenceState,
      provenance_refs: provenance,
      editorial_signal: Number(editorialSignal.toFixed(3)),
      publication_authority: false,
      required_next_gate: 'journal_editorial_10_of_10_preflight'
    }
  };
}
