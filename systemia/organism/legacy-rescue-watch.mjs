import { admitGoalPlan, createGoalState } from './goal-runtime.mjs';

export const LEGACY_RESCUE_WATCH = Object.freeze({
  schema: 'evercraft.systemia.workflow.v1',
  workflow_key: 'legacy-rescue-opportunity-watch',
  mission_key: 'legacy-software-modernization-radar-2026-09-13',
  cadence_seconds: 300,
  objective: 'Continuously find, deduplicate, score, and advance high-value legacy-software modernization pain into no-touch proof-before-pitch work.',
  success_condition: 'Material new opportunities, amendments, deadline changes, partner-fit signals, and commercialization paths are captured with evidence and routed into the Public Rescue pipeline without chat-level scheduling.',
  material_change_only: true,
  scan_terms: [
    'IBM i 7.4',
    'AS/400',
    'RPG',
    'COBOL',
    'JCL',
    'mainframe modernization',
    'legacy ERP',
    'legacy software replacement',
    'Salesforce migration',
    'MuleSoft migration',
    'public-sector modernization',
    'data migration',
    'application refactoring',
  ],
  score_weights: {
    urgency: 0.18,
    buyer_access: 0.24,
    proofability: 0.22,
    evidence_quality: 0.20,
    days_to_cash: 0.16,
  },
  authority: {
    public_research: 'autonomous',
    no_touch_shadow_build: 'autonomous',
    partner_qualification: 'autonomous_public_evidence',
    named_outreach: 'human_gate',
    payment_request: 'human_gate',
    private_system_access: 'explicit_authorization_required',
    production_mutation: 'explicit_authorization_required',
  },
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clampScore(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : 0));
}

export function normalizeLegacyRescueSignal(raw = {}) {
  const source = clean(raw.source || raw.source_name || 'unknown');
  const title = clean(raw.title || raw.name || raw.opportunity || 'untitled');
  const url = clean(raw.url || raw.source_url || '');
  const changeType = clean(raw.change_type || raw.kind || 'new_signal').toLowerCase();
  const externalId = clean(raw.external_id || raw.id || '');
  const signalKey = clean(raw.signal_key || [source, externalId || title, changeType, url].join('|').toLowerCase());

  return {
    signal_key: signalKey,
    source,
    title,
    url,
    change_type: changeType,
    external_id: externalId,
    published_at: clean(raw.published_at || raw.updated_at || ''),
    deadline: clean(raw.deadline || ''),
    evidence_refs: [...new Set((raw.evidence_refs || []).map(clean).filter(Boolean))],
    urgency: clampScore(raw.urgency),
    buyer_access: clampScore(raw.buyer_access),
    proofability: clampScore(raw.proofability),
    evidence_quality: clampScore(raw.evidence_quality),
    days_to_cash: clampScore(raw.days_to_cash),
  };
}

export function dedupeLegacyRescueSignals(signals = []) {
  const seen = new Set();
  const rows = [];
  for (const raw of signals) {
    const signal = normalizeLegacyRescueSignal(raw);
    if (!signal.signal_key || seen.has(signal.signal_key)) continue;
    seen.add(signal.signal_key);
    rows.push(signal);
  }
  return rows;
}

export function scoreLegacyRescueSignal(signal) {
  const row = normalizeLegacyRescueSignal(signal);
  const w = LEGACY_RESCUE_WATCH.score_weights;
  return Math.round(
    row.urgency * w.urgency +
    row.buyer_access * w.buyer_access +
    row.proofability * w.proofability +
    row.evidence_quality * w.evidence_quality +
    row.days_to_cash * w.days_to_cash
  );
}

export function classifyLegacyRescueSignal(signal) {
  const score = scoreLegacyRescueSignal(signal);
  if (score >= 80) return { score, disposition: 'strike_candidate' };
  if (score >= 65) return { score, disposition: 'research_queue' };
  return { score, disposition: 'hold_noise' };
}

export function shouldSurfaceLegacyRescueChange(signal) {
  const normalized = normalizeLegacyRescueSignal(signal);
  if (!LEGACY_RESCUE_WATCH.material_change_only) return true;
  return ['new_signal', 'deadline_change', 'amendment', 'partner_fit', 'commercialization', 'award_change', 'scope_change'].includes(normalized.change_type);
}

export function buildLegacyRescueWatchPlan({ cycleKey }) {
  const cycle = clean(cycleKey);
  if (!cycle) throw new Error('cycleKey is required');

  const prefix = `legacy-rescue-watch:${cycle}`;
  return [
    {
      work_key: 'scan-signals',
      dedupe_key: `${prefix}:scan-signals`,
      title: 'Scan public legacy-modernization signals',
      work_type: 'research',
      assigned_agents: ['chum', 'saban'],
    },
    {
      work_key: 'dedupe-signals',
      dedupe_key: `${prefix}:dedupe-signals`,
      title: 'Deduplicate against active strikes, queue, and prior evidence',
      work_type: 'reconcile',
      dependency_keys: ['scan-signals'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'score-signals',
      dedupe_key: `${prefix}:score-signals`,
      title: 'Score urgency, buyer access, proofability, evidence quality, and days-to-cash',
      work_type: 'score',
      dependency_keys: ['dedupe-signals'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'refresh-rescue-radar',
      dedupe_key: `${prefix}:refresh-rescue-radar`,
      title: 'Refresh Public Rescue Radar and next-strike queue',
      work_type: 'publish_internal',
      dependency_keys: ['score-signals'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'build-no-touch-proof',
      dedupe_key: `${prefix}:build-no-touch-proof`,
      title: 'Build or deepen the highest-value no-touch shadow proof',
      work_type: 'build',
      dependency_keys: ['refresh-rescue-radar'],
      assigned_agents: ['yard', 'saban'],
    },
    {
      work_key: 'prepare-close-packet',
      dedupe_key: `${prefix}:prepare-close-packet`,
      title: 'Prepare partner/buyer proof packet from grounded evidence',
      work_type: 'package',
      dependency_keys: ['build-no-touch-proof'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'named-outreach',
      dedupe_key: `${prefix}:named-outreach`,
      title: 'Send named partner or buyer outreach',
      work_type: 'external_action',
      dependency_keys: ['prepare-close-packet'],
      human_gate_required: true,
      assigned_agents: ['human-approved-operator'],
    },
  ];
}

export function createLegacyRescueWatchGoal({ cycleKey, now = new Date() }) {
  const state = createGoalState({
    goalKey: `legacy-rescue-watch:${clean(cycleKey)}`,
    missionKey: LEGACY_RESCUE_WATCH.mission_key,
    objective: LEGACY_RESCUE_WATCH.objective,
    successCondition: LEGACY_RESCUE_WATCH.success_condition,
    contextRefs: [
      'systemia:public-rescue-radar',
      'systemia:legacy-rescue',
      'systemia:chum',
      'systemia:saban',
    ],
    now,
  });

  return admitGoalPlan({
    state,
    plan: buildLegacyRescueWatchPlan({ cycleKey }),
    now,
  });
}

export function buildLegacyRescueMissionSnapshot({
  cycleKey,
  scanned,
  changed,
  admitted,
  held,
  evidenceRefs = [],
  observedAt = new Date(),
}) {
  const counts = {
    scanned: Math.max(0, Number(scanned || 0)),
    changed: Math.max(0, Number(changed || 0)),
    admitted: Math.max(0, Number(admitted || 0)),
    held: Math.max(0, Number(held || 0)),
  };

  if (counts.changed > counts.scanned) throw new Error('changed cannot exceed scanned');
  if (counts.admitted + counts.held > counts.changed) throw new Error('admitted + held cannot exceed changed');

  const at = observedAt instanceof Date ? observedAt.toISOString() : new Date(observedAt).toISOString();

  return {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: `legacy-rescue-watch:${clean(cycleKey)}`,
    mission_key: LEGACY_RESCUE_WATCH.mission_key,
    workflow_key: LEGACY_RESCUE_WATCH.workflow_key,
    cadence_seconds: LEGACY_RESCUE_WATCH.cadence_seconds,
    counts,
    evidence_refs: [...new Set(evidenceRefs.map(clean).filter(Boolean))].slice(0, 200),
    observed_at: at,
  };
}
