import { spawnSync } from 'node:child_process';

function present(value) {
  return String(value ?? '').trim().length > 0;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function inspectProduct(raw = {}) {
  const actions = [];
  if (!present(raw.canonical_url)) actions.push({ type: 'repair_canonical_url' });
  if (list(raw.intents).length < 3) actions.push({ type: 'expand_natural_language_intents' });
  if (!present(raw.authority)) actions.push({ type: 'declare_public_authority' });
  if (list(raw.boundaries).length === 0) actions.push({ type: 'declare_public_boundaries' });
  return actions;
}

function inspectOffer(raw = {}) {
  const actions = [];
  if (!present(raw.public_url)) actions.push({ type: 'repair_public_offer_url' });
  if (list(raw.intent_terms).length < 3) actions.push({ type: 'expand_offer_intent_terms' });
  if (!present(raw.problem)) actions.push({ type: 'clarify_problem_statement' });
  if (!present(raw.inputs)) actions.push({ type: 'declare_offer_inputs' });
  if (!present(raw.outputs)) actions.push({ type: 'declare_offer_outputs' });
  if (raw.commercial_state === 'sell_now' && !present(raw.pricing)) {
    actions.push({ type: 'repair_sell_now_pricing' });
  }
  return actions;
}

function inspectPain(raw = {}) {
  const actions = [];
  if (list(raw.pain_phrases).length < 3 && list(raw.intent_terms).length < 3) {
    actions.push({ type: 'expand_pain_language_coverage' });
  }
  return actions;
}

function roleActions(role, item) {
  const raw = item?.raw || {};
  const actions =
    item?.kind === 'product' ? inspectProduct(raw) :
    item?.kind === 'offer' ? inspectOffer(raw) :
    item?.kind === 'pain' ? inspectPain(raw) :
    item?.kind === 'external_inventory' ? [{ type: 'candidate_requires_admission_review' }] :
    [];

  switch (role) {
    case 'portfolio_archaeologist':
      if (item?.kind === 'external_inventory') actions.push({ type: 'compare_candidate_to_public_directory' });
      break;
    case 'surface_auditor':
      actions.push({ type: 'verify_llms_and_structured_discovery_surfaces' });
      break;
    case 'intent_cartographer':
      actions.push({ type: 'map_buyer_language_to_smallest_truthful_capability' });
      break;
    case 'answer_door_planner':
      actions.push({ type: 'ensure_answer_door_exists_for_supported_intent' });
      break;
    case 'commerce_path_auditor':
      actions.push({ type: 'verify_human_confirmed_conversion_path' });
      break;
    case 'crawl_pressure_planner':
      actions.push({ type: 'queue_safe_crawl_freshness_signal' });
      break;
    case 'conformance_guard':
      actions.push({ type: 'preserve_public_private_boundary' });
      break;
    case 'reconciliation_scout':
      actions.push({ type: 'dedupe_findings_before_global_rebuild' });
      break;
    default:
      break;
  }
  return actions;
}

export async function runAssignment({ assignment }) {
  const actions = roleActions(assignment.role, assignment.item);
  return {
    status: actions.length ? 'finding' : 'clean',
    agent_id: assignment.agent_id,
    role: assignment.role,
    work: assignment.work,
    actions,
    boundaries: {
      no_unsolicited_human_outreach: true,
      no_automatic_checkout: true,
      no_unverified_provider_claims: true,
      private_topology_stays_private: true
    }
  };
}

function runNode(rootDir, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env
  });
  return {
    command: [process.execPath, ...args].join(' '),
    status: result.status,
    ok: result.status === 0,
    stdout_tail: String(result.stdout || '').trim().slice(-1200),
    stderr_tail: String(result.stderr || '').trim().slice(-1200)
  };
}

export async function reconcile({ rootDir }) {
  const commands = [
    ['systemia/saban/discovery-swarm.mjs', '--emit'],
    ['systemia/chum/build-pain-index.mjs'],
    ['systemia/chum/build-answer-doors.mjs'],
    ['systemia/chum/build-capability-mirror.mjs'],
    ['systemia/chum/build-public-mirror.mjs'],
    ['systemia/chum/crawl-accelerator.mjs']
  ];
  const runs = commands.map((args) => runNode(rootDir, args));
  return {
    status: runs.every((run) => run.ok) ? 'reconciled' : 'reconciliation_failed',
    runs
  };
}
