const HYPOTHESES = Object.freeze([
  {
    id: 'benign_or_ordinary_activity',
    supportive_domains: ['aviation'],
    contradictory_states: ['confirmed_hazard']
  },
  {
    id: 'weather_or_environmental',
    supportive_domains: ['weather', 'environmental'],
    contradictory_states: []
  },
  {
    id: 'sensor_or_data_fault',
    supportive_domains: [],
    contradictory_states: ['confirmed_hazard']
  },
  {
    id: 'infrastructure_or_communications_failure',
    supportive_domains: ['infrastructure', 'communications'],
    contradictory_states: []
  },
  {
    id: 'coordinated_hazard',
    supportive_domains: ['emergency_report', 'infrastructure', 'communications', 'aviation'],
    contradictory_states: ['benign']
  },
  {
    id: 'unknown',
    supportive_domains: [],
    contradictory_states: []
  }
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function evaluateHypotheses(incident) {
  const observations = Array.isArray(incident?.observations) ? incident.observations : [];
  const domains = unique(observations.map((o) => o.domain));
  const hazardStates = unique(observations.map((o) => o.hazard_state));
  const verifiedDomains = unique(
    observations
      .filter((o) => o.evidence_state === 'verified')
      .map((o) => o.domain)
  );

  const hypotheses = HYPOTHESES.map((hypothesis) => {
    const supportingDomains = hypothesis.supportive_domains.filter((d) => domains.includes(d));
    const contradictions = hypothesis.contradictory_states.filter((s) => hazardStates.includes(s));
    const verifiedSupport = supportingDomains.filter((d) => verifiedDomains.includes(d));

    let status = 'insufficient';
    if (contradictions.length) status = 'contested';
    else if (verifiedSupport.length || supportingDomains.length >= 2) status = 'supported';
    else if (supportingDomains.length === 1) status = 'plausible';

    return {
      hypothesis_id: hypothesis.id,
      status,
      supporting_domains: supportingDomains,
      verified_supporting_domains: verifiedSupport,
      contradictions,
      evidence_to_seek: evidenceToSeek(hypothesis.id, domains)
    };
  });

  return {
    schema: 'systemia.sentinel.hypothesis-review.v1',
    incident_id: incident?.id || null,
    attribution: 'unresolved',
    hypotheses,
    rule: 'Hypotheses remain competing explanations. This output does not establish hostile intent, actor identity, or nationality.'
  };
}

function evidenceToSeek(id, domains) {
  const requests = {
    benign_or_ordinary_activity: ['independent aviation context', 'operator or schedule confirmation'],
    weather_or_environmental: ['independent weather observation', 'environmental corroboration'],
    sensor_or_data_fault: ['second sensor family', 'sensor health receipt'],
    infrastructure_or_communications_failure: ['independent service-health source', 'infrastructure operator confirmation'],
    coordinated_hazard: ['authorized emergency confirmation', 'independent cross-domain observation'],
    unknown: ['new independent source family', 'additional domain evidence']
  };
  return (requests[id] || []).filter((item) => {
    if (item.includes('aviation') && domains.includes('aviation')) return false;
    if (item.includes('weather') && domains.includes('weather')) return false;
    return true;
  });
}

export function buildSabanHypothesisJobs(incident) {
  const review = evaluateHypotheses(incident);
  return review.hypotheses.map((row) => ({
    job_id: 'sentinel-hypothesis:' + (incident?.id || 'unknown') + ':' + row.hypothesis_id,
    hypothesis_id: row.hypothesis_id,
    objective: 'Attempt to falsify this explanation using independent evidence.',
    current_status: row.status,
    evidence_to_seek: row.evidence_to_seek,
    constraints: [
      'Do not infer hostile intent from anomaly alone.',
      'Do not infer actor identity or nationality.',
      'Prefer independent source families over repeated reports.',
      'Return uncertainty and provenance.'
    ]
  }));
}
