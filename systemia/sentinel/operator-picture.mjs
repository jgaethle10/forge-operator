import { evaluateHypotheses } from './hypotheses.mjs';

export function buildOperatorPicture(incident) {
  if (!incident?.assessment) throw new TypeError('incident assessment is required');

  const domains = [...new Set((incident.observations || []).map((o) => o.domain))].sort();
  const sourceFamilies = [...new Set((incident.observations || []).map((o) => o.source_family))].sort();
  const independenceGroups = [...new Set((incident.observations || []).map((o) => o.independence_group || o.source_family))].sort();

  const passiveActions = {
    watch: ['continue observation'],
    corroborating: ['request independent corroboration'],
    elevated: ['notify operator', 'review passive protective procedures'],
    urgent: ['notify operator immediately', 'prepare authorized handoff', 'review passive protective procedures']
  }[incident.assessment.level] || ['continue observation'];

  return {
    schema: 'systemia.sentinel.operator-picture.v1',
    incident_id: incident.id,
    region_key: incident.region_key,
    first_seen_at: incident.first_seen_at,
    last_seen_at: incident.last_seen_at,
    level: incident.assessment.level,
    confidence: incident.assessment.confidence,
    attribution: 'unresolved',
    independent_source_families: independenceGroups.length,
    independent_source_groups: independenceGroups,
    raw_source_families: sourceFamilies.length,
    domains,
    source_families: sourceFamilies,
    verified_observations: incident.assessment.verified_observations,
    confirmed_hazard: incident.assessment.confirmed_hazard,
    passive_actions: passiveActions,
    hypothesis_review: evaluateHypotheses(incident),
    handoff_boundary: 'Authorized humans or public-safety systems decide any intervention. Sentinel supplies evidence and uncertainty only.'
  };
}
