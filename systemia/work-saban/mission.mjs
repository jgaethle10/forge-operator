import { randomUUID } from 'node:crypto';
import { topologicalWaves } from '../saban/formation.mjs';

const ROLES = Object.freeze({
  director: ['Mission Director', 'Clarifies objective, deliverables and constraints'],
  researcher: ['Research Specialist', 'Finds evidence and documents its provenance'],
  analyst: ['Data Analyst', 'Reviews datasets, calculations and key drivers'],
  writer: ['Communications Specialist', 'Drafts language matched to the audience'],
  designer: ['Presentation Designer', 'Builds clear information architecture'],
  operations: ['Workflow Engineer', 'Maps process, dependencies and controls'],
  auditor: ['Quality Auditor', 'Checks evidence, numbers and missing inputs'],
  coordinator: ['Delivery Coordinator', 'Packages outputs and approval requests'],
});

const SIGNALS = Object.freeze({
  analyst: /\b(data|spreadsheet|excel|csv|numbers|revenue|sales|budget|finance|financial|trend|metric|kpi|forecast|calculate|compare|report)\b/i,
  researcher: /\b(research|investigate|find|source|market|competitor|survey|compare|evaluate|why|evidence)\b/i,
  writer: /\b(write|email|message|letter|memo|draft|proposal|copy|announce|summary|summarize|newsletter|respond)\b/i,
  designer: /\b(slide|presentation|deck|pitch|visual|chart|graphic|design|powerpoint)\b/i,
  operations: /\b(workflow|process|project|schedule|plan|coordinate|organize|inventory|automate|procedure|onboard|operations)\b/i,
});

const SIDE_EFFECTS = Object.freeze([
  { id: 'external-send', label: 'Sending messages or publishing content' },
  { id: 'data-write', label: 'Changing connected business records' },
  { id: 'spend', label: 'Spending money or creating orders' },
  { id: 'external-access', label: 'Accessing third-party accounts or private files' },
]);

function normalizedTask(task) {
  if (typeof task !== 'string') throw new TypeError('task_must_be_text');
  const result = task.normalize('NFKC').trim();
  if (result.length < 8 || result.length > 4000) throw new RangeError('task_length_out_of_bounds');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new Error('task_contains_control_characters');
  return result;
}

function selectSpecialists(task) {
  const matched = Object.entries(SIGNALS).filter(([, pattern]) => pattern.test(task)).map(([role]) => role);
  return matched.length ? matched : ['researcher'];
}

export function composeWorkSabanMission({ task, audience = '', attachments = [] } = {}) {
  const request = normalizedTask(task);
  if (typeof audience !== 'string' || audience.length > 120) throw new Error('invalid_audience');
  if (!Array.isArray(attachments) || attachments.length > 12 || attachments.some(v => typeof v !== 'string' || v.length > 180)) {
    throw new Error('invalid_attachment_labels');
  }
  const specialists = selectSpecialists(request);
  const nodes = [
    { id: 'director', depends_on: [], phase: 'scope' },
    ...specialists.map(id => ({ id, depends_on: ['director'], phase: 'specialist' })),
    { id: 'auditor', depends_on: specialists, phase: 'verify' },
    { id: 'coordinator', depends_on: ['auditor'], phase: 'delivery' },
  ].map(({ id, depends_on, phase }) => ({
    id,
    role: ROLES[id][0],
    responsibility: ROLES[id][1],
    depends_on,
    phase,
    state: 'proposed_not_running',
    execution_contract: null,
  }));
  const waves = topologicalWaves(nodes);
  return {
    schema: 'evercraft.work-saban.mission-proposal.v1',
    mission_id: `work-saban-${randomUUID()}`,
    product: 'Evercraft Work Saban',
    state: 'proposed_not_admitted',
    submitted_task: request,
    audience: audience.trim() || null,
    attachment_labels: [...attachments],
    team: nodes,
    execution_waves: waves,
    deliverables: [
      'Scope and assumptions',
      'Specialist findings with source or calculation references',
      'Verified deliverable draft',
      'Approval-ready output and work receipts',
    ],
    permission_gates: SIDE_EFFECTS,
    inputs_required: attachments.length ? ['Verify attachment ownership and grant per-file access'] : [],
    policies: {
      customer_data_is_private: true,
      public_publication_allowed: false,
      external_side_effects_allowed: false,
      money_movement_allowed: false,
      live_worker_dispatch_allowed: false,
      requires_explicit_approval_for_actions: true,
    },
    proof_state: 'formation_planned_only',
    next_action: 'Connect registered Saban execution contracts, user identity, and per-action approval before running specialists.',
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const index = process.argv.indexOf('--task');
  const task = index === -1 ? '' : process.argv[index + 1];
  try {
    process.stdout.write(JSON.stringify(composeWorkSabanMission({ task }), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
