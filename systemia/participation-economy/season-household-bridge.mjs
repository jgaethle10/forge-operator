// Source-only Home / Season & Story bridge. No identity, network, publication,
// service dispatch, booking or financial authority. All inputs are untrusted.
import { createHash } from 'node:crypto';
const ref = x => typeof x === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(x);
const kinds = new Set(['seasonal_checklist','recipe','tradition','local_event','home_maintenance']);
const seasons = new Set(['spring','summer','autumn','winter','year_round']);
const services = Object.freeze({
  yard_cleanup:'eps', snow_removal:'eps', gutter_cleaning:'eps',
  seasonal_cleaning:'havenly', home_cleaning:'havenly'
});
const noAuthority = Object.freeze({published:false, external_contact:false, job_created:false,
  booking_created:false, payment_authority:false, payouts_enabled:false});
function exactKeys(obj, keys) {
  return obj && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).every(k => keys.includes(k));
}
// A reviewed public card may be saved as an idea; no household fields pass back.
export function seasonalCardCandidate(card) {
  if (!exactKeys(card,['card_ref','source_ref','kind','season','review_state','creator_opt_in','sponsored','sponsor_label']) ||
      !ref(card.card_ref) || !ref(card.source_ref) || !kinds.has(card.kind) || !seasons.has(card.season))
    throw Error('invalid_public_card');
  if (typeof card.sponsored !== 'boolean' ||
      (card.sponsored && !ref(card.sponsor_label)) ||
      (!card.sponsored && card.sponsor_label != null)) throw Error('sponsor_disclosure_required');
  const eligible = card.review_state === 'approved' && card.creator_opt_in === true;
  return { schema:'evercraft.home.season-card-candidate.v1', card_ref:card.card_ref,
    source_ref:card.source_ref, kind:card.kind, season:card.season,
    sponsored:card.sponsored, sponsor_label:card.sponsor_label ?? null,
    state:eligible?'candidate_for_trusted_review':'held',
    save_to_household_authority:false, review_attestation:'caller_asserted_not_authenticated',
    ...noAuthority };
}
// Private preview only. Caller-provided identity and consent are not trusted.
export function seasonalEstimateCandidate({actor, task, consent} = {}) {
  if (!exactKeys(actor,['household_ref','actor_ref']) || !ref(actor.household_ref) || !ref(actor.actor_ref) ||
      !exactKeys(task,['household_ref','task_ref','service_kind','state','revision']) ||
      !ref(task.household_ref) || !ref(task.task_ref) || !Number.isSafeInteger(task.revision) || task.revision < 1 ||
      !Object.hasOwn(services,task.service_kind) || !['open','completed','cancelled'].includes(task.state))
    throw Error('invalid_private_task');
  if (actor.household_ref !== task.household_ref) throw Error('household_scope_mismatch');
  const allowed = exactKeys(consent,['actor_ref','household_ref','task_ref','revision','purpose','state']) &&
    consent.actor_ref === actor.actor_ref && consent.household_ref === task.household_ref &&
    consent.task_ref === task.task_ref && consent.revision === task.revision &&
    consent.purpose === 'nonbinding_estimate_preview' && consent.state === 'granted' && task.state === 'open';
  return {schema:'evercraft.home.season-estimate-candidate.v1',
    audience:'private_household_only', state:allowed?'candidate_for_authenticated_intake':'held',
    destination:allowed?services[task.service_kind]:null,
    service_kind:allowed?task.service_kind:null,
    dedupe_key:allowed?createHash('sha256').update(JSON.stringify([task.household_ref,task.task_ref,task.revision,task.service_kind])).digest('hex'):null,
    consent_attestation:'caller_asserted_not_authenticated', public_projection:null,
    quote_cents:null, creator_earnings_cents:null, ...noAuthority};
}
