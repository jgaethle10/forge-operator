/**
 * Evercraft Events: a read-only planning adapter for existing Demand / Opportunity Fabric.
 * Input is source references and operator observations, NEVER public contact details.
 * This file makes no network calls, schedules, bookings, purchases or authorizations.
 */
export const EVENT_SCENARIOS = Object.freeze({
  indoor_headphone: 'Indoor headphone music + quiet heritage exhibit',
  outdoor_separate: 'Outdoor independently supported stage + quiet heritage exhibit',
  heritage_only: 'Guided heritage experience / filmed fundraiser',
  hybrid_silent_zone: 'Outdoor main stage + limited indoor headphone dance zone + heritage exhibits',
});

const GATES = Object.freeze([
  { id: 'venue_authority', owner: 'museum/property owner', question: 'Written permission to study specified event areas' },
  { id: 'current_condition', owner: 'preservation lead', question: 'Current structural condition, repairs, shoring and exclusion areas' },
  { id: 'space_and_use', owner: 'property owner / local authority', question: 'Site boundaries, occupancy designation and allowed use' },
  { id: 'structural_review', owner: 'qualified structural engineer', question: 'Existing and proposed structural/dynamic loads reviewed' },
  { id: 'acoustic_review', owner: 'qualified acoustical consultant', question: 'Airborne and structure-borne sound/vibration paths evaluated' },
  { id: 'crowd_loads', owner: 'structural engineer / event producer', question: 'Crowd density, floor loading and rhythmic movement evaluated' },
  { id: 'fire_life_safety', owner: 'fire authority / event producer', question: 'Fire protection, egress and emergency communications reviewed' },
  { id: 'access_and_airfield', owner: 'property owner / airport authority', question: 'Vehicle, ADA, parking and airport operating restrictions reviewed' },
  { id: 'insurance_and_permits', owner: 'producer / insurer / permitting authorities', question: 'Applicable licenses, permits, insurance and contractors identified' },
  { id: 'jurisdiction_and_event_hours', owner: 'venue / city or county permitting authority / producer', question: 'Exact site parcel jurisdiction, applicable festival and dance rules, enforceable amplified-sound hours, exceptions and clear-out deadlines verified in writing before scheduling' },
  { id: 'charitable_agreement', owner: 'museum / organizer / counsel', question: 'Written stewardship of proceeds and charitable claims agreed' },
  { id: 'production_plan', owner: 'qualified production partner', question: 'Crew, independent rigging, power, vendors and run of show planned' },
  { id: 'weather_and_emergency', owner: 'event producer', question: 'Weather cancellation, crowd safety and emergency plan reviewed' },
]);

const EXTRA = Object.freeze({
  indoor_headphone: [
    { id: 'headphone_comms', owner: 'production / safety lead', question: 'Headphone system emergency interruption and hearing protection' },
    { id: 'artifact_protection', owner: 'museum curator', question: 'Museum exhibits and historic fabric physically protected' },
  ],
  outdoor_separate: [
    { id: 'outdoor_ground_and_wind', owner: 'qualified staging engineer', question: 'Ground-bearing, temporary structure and wind capacity reviewed' },
    { id: 'outdoor_transmission', owner: 'acoustical consultant', question: 'Outdoor sound/vibration transmission to museum and neighbors assessed' },
  ],
  heritage_only: [
    { id: 'filming_and_exhibits', owner: 'museum curator', question: 'Filming, exhibit use and visitor access permitted' },
  ],
  hybrid_silent_zone: [
    { id: 'outdoor_ground_and_wind', owner: 'qualified staging engineer', question: 'Outdoor staging ground bearing, independent supports, wind/weather and power safety assessed' },
    { id: 'outdoor_transmission', owner: 'acoustical consultant', question: 'Outdoor music sound and ground-borne vibration propagation toward historic structure evaluated' },
    { id: 'silent_zone_footprint', owner: 'museum / fire authority', question: 'Approved indoor location, emergency routes, attendee caps and crowd distribution identified from real site plans' },
    { id: 'headphone_comms', owner: 'production / safety lead', question: 'Headphone listening dose, volume limiting and immediate accessible emergency interruption demonstrated' },
    { id: 'silent_zone_vibration', owner: 'historic structural engineer', question: 'Potential dancing, stamping and synchronized crowd forces transmitted via floor/foundations assessed' },
    { id: 'artifact_protection', owner: 'museum curator', question: 'Exhibits, vulnerable historic fabric and active roof-repair areas separated from dance and equipment zones' },
    { id: 'visual_effects_review', owner: 'museum / airport / event production', question: 'Freestanding fixtures, cabling, light sensitivity and airport-directed light spill reviewed; no unapproved rigging' },
  ],
});

const FEATURE_GATES = Object.freeze({
  international_performers: { id: 'international_performers', owner: 'artist liaison / qualified immigration counsel', question: 'Performer eligibility, travel, work authorization, contracts and financial responsibilities verified; a visitor classification or unpaid performance alone is not permission to work' },
  acoustic_dome_performance: { id: 'acoustic_dome_performance', owner: 'venue / event production / acoustical lead', question: 'Indoor acoustic session footprint, safe levels, museum exhibits, accessible emergency communication and qualified fire/structural checks reviewed; dome is not assumed soundproof' },
  quiet_wing: { id: 'quiet_wing', owner: 'accessibility and safety lead / venue', question: 'Quiet reset area has truly separated noise, accessible seating and egress, fire-safe material, water/spill controls and protection of artifacts' },
  guest_dj: { id: 'guest_dj', owner: 'production / host / licensing lead', question: 'Guest DJ turn-taking, hearing/sound limits, electrical and trip safety, supervision, accessibility and public music rights established' },
  karaoke: { id: 'karaoke', owner: 'production / venue / music licensing lead', question: 'Karaoke sound footprint, neighboring uses, microphones/lyrics rights, host rotation, electrical safety and operating hours authorized' },
  art_exhibition: { id: 'art_exhibition', owner: 'curator / artist liaison', question: 'Freestanding exhibits, original artist consent, copyright/license, display custody and museum artifact/egress protections agreed' },
  photography_contest: { id: 'photography_contest', owner: 'photo curator / contest operator', question: 'Contest rules, judging, ownership, photo rights, identifiable-person consent, display permissions and possible awards reviewed before accepting submissions' },
  food_contest: { id: 'food_contest', owner: 'Tillamook health authority / licensed food coordinator', question: 'Food vendor license requirements, health approval, tasting and allergy safeguards, waste, power, water, fire and outdoor location verified before food offerings' },
  silent_auction: { id: 'silent_auction', owner: 'museum beneficiary / organizer / legal reviewer', question: 'Written beneficiary and monetary terms, donor/consignor rights, item custody, bid rules, tax/charity statements and payment handling established before bids or collections' },
  freestanding_visual_dome: { id: 'freestanding_visual_dome', owner: 'fire authority / qualified event structural lead', question: 'Separate dome occupancy, fire classification/material, egress, ventilation, wind/anchorage and emergency lighting reviewed' },
  open_flame: { id: 'open_flame', owner: 'museum / fire authority', question: 'Separate written flame-effects and heritage safety approval' },
  aerial_laser: { id: 'aerial_laser', owner: 'airport / aviation authority', question: 'Separate aviation-safe laser/beam review' },
  drones: { id: 'drones', owner: 'airport / aviation authority', question: 'Separate airspace and property-owner flight permission' },
  historic_structure_rigging: { id: 'historic_structure_rigging', owner: 'historic structural engineer', question: 'Separate written load path / attachment approval' },
});

const text = (value) => typeof value === 'string' ? value.trim() : '';
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function statusForEvidence(entry) {
  // Untrusted source notes never grant execution authority.
  if (!entry || typeof entry !== 'object') return 'missing';
  const finding = text(entry.finding).toLowerCase();
  if (['unsafe', 'declined', 'not_permitted', 'denied'].includes(finding)) return 'hold_reported';
  return text(entry.source_ref) && text(entry.observed_at)
    ? 'submitted_unverified'
    : 'missing';
}

/**
 * Make an owner-review packet. This is NOT a permission-to-proceed decision.
 * Evidence should contain only private ledger reference IDs or public source URLs.
 */
export function assessEventFeasibility(input = {}) {
  const opportunityId = text(input.opportunity_id);
  if (!opportunityId || opportunityId.length > 160) throw Error('opportunity_id_required');
  const scenario = text(input.scenario) || 'outdoor_separate';
  if (!own(EVENT_SCENARIOS, scenario)) throw Error('scenario_not_supported');
  if (input.evidence != null && (typeof input.evidence !== 'object' || Array.isArray(input.evidence))) {
    throw Error('evidence_object_required');
  }
  const features = input.features ?? [];
  if (!Array.isArray(features) || features.some(feature => !own(FEATURE_GATES, feature))) {
    throw Error('features_invalid');
  }
  const uniqueFeatures = [...new Set(features)];
  const requirements = [...GATES, ...EXTRA[scenario], ...uniqueFeatures.map(feature => FEATURE_GATES[feature])];
  const checks = requirements.map(requirement => {
    const status = statusForEvidence(input.evidence?.[requirement.id]);
    return { ...requirement, status, source_ref: status !== 'missing' ? text(input.evidence[requirement.id]?.source_ref) || null : null };
  });
  const safetyHold = checks.some(check => check.status === 'hold_reported');
  const unproven = checks.filter(check => check.status !== 'submitted_unverified');
  return {
    schema: 'evercraft.events.feasibility-review.v1',
    opportunity_id: opportunityId,
    scenario,
    scenario_description: EVENT_SCENARIOS[scenario],
    source: 'owned_source_only',
    stage: safetyHold ? 'hold_pending_qualified_review' :
      unproven.length ? 'discovery_incomplete' : 'dossier_ready_for_independent_review',
    checks,
    next_work: checks.filter(check => check.status !== 'submitted_unverified')
      .map(check => ({ requirement: check.id, owner: check.owner, question: check.question, priority: check.status === 'hold_reported' ? 'stop_and_review' : 'obtain_evidence' })),
    qualified_review_required: true,
    external_contact_authorized: false,
    event_approved: false,
    ticket_sales_authorized: false,
    charitable_collection_authorized: false,
    performance_or_testing_authorized: false,
    note: 'Source references and self-reported findings do not constitute independent engineering, museum, permit or Passport authorization.',
  };
}


/**
 * Flagship REIGNITE planning profile. Selecting an idea makes its review gates
 * visible; it does NOT enable a location, book a performer, permit a program,
 * establish sound hours, or collect donations.
 */
export const REIGNITE_CONCEPT_FEATURES = Object.freeze([
  'freestanding_visual_dome','acoustic_dome_performance','quiet_wing',
  'guest_dj','karaoke','art_exhibition','photography_contest','food_contest',
  'silent_auction','international_performers'
]);

export function assessReigniteConcept({evidence={},scenario='outdoor_separate'}={}) {
  return assessEventFeasibility({
    opportunity_id:'reignite:hangar-b',
    scenario,evidence,
    features:REIGNITE_CONCEPT_FEATURES
  });
}

/**
 * A straightforward owner-facing summary from the canonical gate model.
 * This is a prompt for evidence gathering, never a release decision.
 */
export function eventNextActions(assessment,{limit=5}={}) {
  if(assessment?.schema!=='evercraft.events.feasibility-review.v1')
    throw Error('assessment_required');
  if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('invalid_action_limit');
  const holds=assessment.next_work.filter(x=>x.priority==='stop_and_review');
  const others=assessment.next_work.filter(x=>x.priority!=='stop_and_review');
  const pending=holds.concat(others);
  return {
    schema:'evercraft.events.next-actions.v1',
    opportunity_id:assessment.opportunity_id,
    headline:holds.length?
      'Stop and resolve a reported concern with qualified reviewers':
      'Confirm the real venue, sound hours and safety requirements before announcing REIGNITE',
    total_requirements:assessment.checks.length,
    evidence_missing:assessment.checks.filter(x=>x.status==='missing').length,
    evidence_submitted_unverified:assessment.checks.filter(x=>x.status==='submitted_unverified').length,
    reported_holds:holds.length,
    next:pending.slice(0,limit),
    next_action_count:pending.length,
    event_approved:false,
    ticket_sales_authorized:false,
    notes:'Only an evidence collection summary. Approved venue footprint and qualified release decisions remain external.'
  };
}

export function eventWorkPackages(assessment) {
  if (assessment?.schema !== 'evercraft.events.feasibility-review.v1') throw Error('assessment_required');
  return assessment.checks.map(check => ({
    opportunity_id: assessment.opportunity_id,
    work_package_key: assessment.opportunity_id + ':' + check.id,
    responsibility: check.owner,
    objective: check.question,
    evidence_status: check.status,
    work_state: check.status === 'submitted_unverified' ? 'needs_independent_review' :
      check.status === 'hold_reported' ? 'stop_for_review' : 'not_started',
    assignment_state: 'unassigned',
    contract_state: 'unconfirmed',
    authorized_to_dispatch: false,
  }));
}

/**
 * Read-only adapter for the EXISTING owned Demand Desk /api/systemia/queue.
 * A pipeline stage or "verified" marketing signal is NOT venue or event approval.
 * The trusted owner runtime must separately establish the queue's provenance.
 */
export function assessEventFromDemandQueue(queue, opportunityId, options = {}) {
  const id = text(opportunityId);
  if (!id) throw Error('opportunity_id_required');
  if (queue?.schema !== 1 || queue?.kind !== 'evercraft.demand-desk.queue' ||
      !Number.isInteger(queue.revision) || queue.revision < 0 ||
      !Array.isArray(queue.opportunities)) {
    throw Error('demand_queue_contract_invalid');
  }
  const records = queue.opportunities.filter(row => row?.id === id);
  if (records.length !== 1) throw Error('demand_opportunity_missing_or_duplicate');
  const record = records[0];
  if (['Won', 'Closed', 'Lost'].includes(record.status)) {
    throw Error('demand_opportunity_not_open');
  }
  const packet = assessEventFeasibility({ ...options, opportunity_id: id });
  return {
    ...packet,
    demand_queue_revision: queue.revision,
    demand_stage_observed: text(record.status) || 'unknown',
    demand_verified_claim: record.verified === true,
    demand_stage_is_not_event_approval: true,
  };
}
