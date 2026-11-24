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
    { id: 'temporary_dome_review', owner: 'fire authority / event structural lead', question: 'If an optional freestanding visual dome is used: membrane/fire classification, egress, ventilation, anchorage and emergency lighting reviewed' },
    { id: 'visual_effects_review', owner: 'museum / airport / event production', question: 'Freestanding fixtures, cabling, light sensitivity and airport-directed light spill reviewed; no unapproved rigging' },
  ],
});

const FEATURE_GATES = Object.freeze({
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
