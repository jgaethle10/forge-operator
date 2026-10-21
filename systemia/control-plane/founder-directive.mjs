// Founder directives become inert canonical admission candidates, never a second mission writer.
// The caller MUST supply a fresh, trusted canonical mission snapshot; this module cannot attest it.
import { createHash } from 'node:crypto';

const clean = value => String(value ?? '').trim();
const keyFor = (missionKey, title, intent) => 'founder-integration-' +
  createHash('sha256').update(missionKey + '\n' + title + '\n' + intent).digest('hex').slice(0, 24);

export function prepareFounderDirective({ draft, canonicalMissions } = {}) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('founder_directive_draft_required');
  }
  if (!Array.isArray(canonicalMissions)) {
    throw new Error('trusted_canonical_mission_snapshot_required');
  }

  const missionKey = clean(draft.canonical_mission_key);
  const title = clean(draft.title);
  const intent = clean(draft.intent);
  if (title.length < 8 || title.length > 160 || intent.length < 35 || intent.length > 6500) {
    throw new Error('founder_directive_invalid_scope');
  }
  if (clean(draft.state) !== 'draft') {
    throw new Error('only_unadmitted_drafts_can_be_prepared');
  }

  const matching = canonicalMissions.filter(m => clean(m?.mission_key) === missionKey);
  if (matching.length !== 1 || clean(matching[0].status) !== 'active') {
    throw new Error('canonical_existing_active_mission_required');
  }

  const workKey = keyFor(missionKey, title, intent);
  return {
    schema: 'evercraft.systemia.founder-directive-prepared.v1',
    disposition: 'prepared_for_canonical_admission',
    mission_key: missionKey,
    work_key: workKey,
    source_draft_ref: clean(draft.directive_key) || null,
    request: {
      mission_key: missionKey,
      objective: title,
      success_condition: 'Independent receipts confirm an end-to-end result or expose exact blockers.',
      tasks: [{
        work_key: workKey,
        title,
        description: intent,
        work_type: 'analyze',
        context_required: true,
        dependency_keys: [],
      }],
    },
    requirements: {
      fresh_canonical_read_before_write: true,
      canonical_dedupe: true,
      signed_admission_receipt: true,
      execution_gate_if_applicable: true,
      independent_outcome_verification: true,
    },
    admission_receipt_ref: null,
    mission_created: false,
    admitted: false,
    execution_authority_granted: false,
    external_side_effects_authorized: false,
    execution_verified: false,
    delivered: false,
    note: 'Preparation only. Submit this bounded request through existing Systemia admission; do not create a second mission ledger, execution engine, or public door.',
  };
}
