import crypto from 'node:crypto';
import { admitGoalPlan, createGoalState } from './goal-runtime.mjs';
import { classifyLegacyRescueSignal, normalizeLegacyRescueSignal } from './legacy-rescue-watch.mjs';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values, limit = 200) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function legacyRescueStrikeKey(signal) {
  const normalized = normalizeLegacyRescueSignal(signal);
  return `public-rescue-strike:${digest(normalized.signal_key).slice(0, 16)}`;
}

export function buildLegacyRescueStrikePlan({ signal, goalKey }) {
  const candidate = normalizeLegacyRescueSignal(signal);
  const prefix = clean(goalKey) || legacyRescueStrikeKey(candidate);

  return [
    {
      work_key: 'ground-public-evidence',
      dedupe_key: `${prefix}:ground-public-evidence`,
      title: 'Ground the target in current public evidence',
      work_type: 'research',
      assigned_agents: ['chum', 'saban'],
    },
    {
      work_key: 'reconstruct-visible-system',
      dedupe_key: `${prefix}:reconstruct-visible-system`,
      title: 'Reconstruct only the publicly evidenced system and migration pressure',
      work_type: 'analysis',
      dependency_keys: ['ground-public-evidence'],
      assigned_agents: ['systemia-organism', 'saban'],
    },
    {
      work_key: 'build-no-touch-shadow',
      dedupe_key: `${prefix}:build-no-touch-shadow`,
      title: 'Build a no-touch shadow proof without private-system access',
      work_type: 'build',
      dependency_keys: ['reconstruct-visible-system'],
      assigned_agents: ['yard', 'saban'],
    },
    {
      work_key: 'adversarial-evidence-qa',
      dedupe_key: `${prefix}:adversarial-evidence-qa`,
      title: 'Adversarially test claims, provenance, boundaries, and proof state',
      work_type: 'qa',
      dependency_keys: ['build-no-touch-shadow'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'package-proof-before-pitch',
      dedupe_key: `${prefix}:package-proof-before-pitch`,
      title: 'Package the grounded proof and bounded commercial wedge',
      work_type: 'package',
      dependency_keys: ['adversarial-evidence-qa'],
      assigned_agents: ['systemia-organism'],
    },
    {
      work_key: 'qualify-buyer-access',
      dedupe_key: `${prefix}:qualify-buyer-access`,
      title: 'Identify legitimate buyer or partner access without claiming a relationship',
      work_type: 'research',
      dependency_keys: ['adversarial-evidence-qa'],
      assigned_agents: ['chum', 'systemia-organism'],
    },
    {
      work_key: 'founder-review-outreach',
      dedupe_key: `${prefix}:founder-review-outreach`,
      title: 'Review named outreach or payment ask before external action',
      work_type: 'external_action',
      dependency_keys: ['package-proof-before-pitch', 'qualify-buyer-access'],
      human_gate_required: true,
      assigned_agents: ['human-approved-operator'],
    },
  ];
}

export function admitLegacyRescueStrike({ signal, cycleKey = '', now = new Date() } = {}) {
  const candidate = normalizeLegacyRescueSignal(signal);
  const classification = classifyLegacyRescueSignal(candidate);
  const at = now instanceof Date ? now : new Date(now);

  if (classification.disposition !== 'strike_candidate') {
    return {
      schema: 'evercraft.legacy-rescue.strike-admission.v1',
      admitted: false,
      reason: classification.disposition === 'research_queue' ? 'research_queue_only' : 'below_strike_threshold',
      score: classification.score,
      disposition: classification.disposition,
      cycle_key: clean(cycleKey),
      signal: candidate,
      observed_at: at.toISOString(),
    };
  }

  const goalKey = legacyRescueStrikeKey(candidate);
  let state = createGoalState({
    goalKey,
    missionKey: 'legacy-software-modernization-radar-2026-09-13',
    objective: `Build an evidence-grounded no-touch Public Rescue Strike for ${candidate.title} before any pitch or private-system access.`,
    successCondition: 'A public-evidence shadow proof, adversarial evidence QA, bounded commercial package, and buyer-access qualification exist; named outreach remains human-gated.',
    contextRefs: unique([
      candidate.url ? `url:${candidate.url}` : '',
      `signal:${candidate.signal_key}`,
      ...candidate.evidence_refs,
      'systemia:public-rescue-radar',
      'systemia:legacy-rescue',
      'systemia:chum',
      'systemia:saban',
    ]),
    now: at,
  });

  state = admitGoalPlan({
    state,
    plan: buildLegacyRescueStrikePlan({ signal: candidate, goalKey }),
    now: at,
  });
  state.evidence_refs = unique([
    ...state.evidence_refs,
    ...candidate.evidence_refs,
    candidate.url ? `url:${candidate.url}` : '',
    `signal:${candidate.signal_key}`,
  ]);

  return {
    schema: 'evercraft.legacy-rescue.strike-admission.v1',
    admitted: true,
    reason: 'strike_threshold_met',
    score: classification.score,
    disposition: classification.disposition,
    cycle_key: clean(cycleKey),
    signal: candidate,
    goal_state: state,
    authority: {
      public_research: 'autonomous',
      no_touch_shadow_build: 'autonomous',
      named_outreach: 'human_gate',
      payment_request: 'human_gate',
      private_system_access: 'explicit_authorization_required',
      production_mutation: 'explicit_authorization_required',
    },
    observed_at: at.toISOString(),
  };
}
