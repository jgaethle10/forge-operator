import crypto from 'node:crypto';

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const list = (v) => [...new Set((Array.isArray(v) ? v : [v]).map(clean).filter(Boolean))];
const clamp01 = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

export function normalizeWorldstateScope(raw = {}) {
  if (raw.people || raw.person_ids || raw.individuals) {
    throw new TypeError('Worldstate scopes cannot target individual people');
  }

  const scope = {
    scope_id: clean(raw.scope_id) || null,
    name: clean(raw.name || 'Worldstate scope'),
    region_keys: list(raw.region_keys).map((x) => x.toLowerCase()),
    domains: list(raw.domains).map((x) => x.toLowerCase()),
    assets: list(raw.assets),
    facilities: list(raw.facilities),
    routes: list(raw.routes),
    dependencies: list(raw.dependencies).map((x) => x.toLowerCase()),
    industries: list(raw.industries).map((x) => x.toLowerCase()),
    topics: list(raw.topics).map((x) => x.toLowerCase()),
    materiality_threshold: clamp01(raw.materiality_threshold, 0.35)
  };

  if (!scope.scope_id) scope.scope_id = `wscope:${hash(scope)}`;
  return { schema: 'evercraft.worldstate.scope.v1', ...scope };
}

function observationTerms(observation) {
  const fields = [
    observation.summary,
    ...(observation.domains || []),
    ...(observation.region_keys || []),
    observation.kind,
    observation.source_family,
    ...Object.keys(observation.facts || {}),
    ...Object.values(observation.facts || {}).filter((v) => ['string','number','boolean'].includes(typeof v))
  ];
  return fields.map((x) => clean(x).toLowerCase()).filter(Boolean);
}

function hasToken(terms, needle) {
  const q = clean(needle).toLowerCase();
  return q && terms.some((term) => term.includes(q) || q.includes(term));
}

export function scoreObservationForScope(observation, scopeInput) {
  const scope = normalizeWorldstateScope(scopeInput);
  const regions = new Set((observation.region_keys || []).map((x) => clean(x).toLowerCase()));
  const domains = new Set((observation.domains || []).map((x) => clean(x).toLowerCase()));
  const terms = observationTerms(observation);

  const matches = {
    region: scope.region_keys.filter((x) => regions.has(x)),
    domain: scope.domains.filter((x) => domains.has(x)),
    asset: scope.assets.filter((x) => hasToken(terms, x)),
    facility: scope.facilities.filter((x) => hasToken(terms, x)),
    route: scope.routes.filter((x) => hasToken(terms, x)),
    dependency: scope.dependencies.filter((x) => hasToken(terms, x) || domains.has(x)),
    industry: scope.industries.filter((x) => hasToken(terms, x)),
    topic: scope.topics.filter((x) => hasToken(terms, x))
  };

  const hardSubjectCriteriaCount =
    scope.assets.length +
    scope.facilities.length +
    scope.routes.length;

  const hardSubjectMatchCount =
    matches.asset.length +
    matches.facility.length +
    matches.route.length;

  const interestCriteriaCount =
    scope.dependencies.length +
    scope.industries.length +
    scope.topics.length;

  const interestMatchCount =
    matches.dependency.length +
    matches.industry.length +
    matches.topic.length;

  const hasHardBoundary =
    scope.region_keys.length > 0 ||
    scope.domains.length > 0 ||
    hardSubjectCriteriaCount > 0;

  const scope_gates = {
    region: {
      required: scope.region_keys.length > 0,
      passed: scope.region_keys.length === 0 || matches.region.length > 0
    },
    domain: {
      required: scope.domains.length > 0,
      passed: scope.domains.length === 0 || matches.domain.length > 0
    },
    subject: {
      required: hardSubjectCriteriaCount > 0,
      passed: hardSubjectCriteriaCount === 0 || hardSubjectMatchCount > 0
    },
    interest: {
      required: interestCriteriaCount > 0 && !hasHardBoundary,
      passed: interestCriteriaCount === 0 || interestMatchCount > 0 || hasHardBoundary
    }
  };

  const hasAnyCriteria =
    scope_gates.region.required ||
    scope_gates.domain.required ||
    scope_gates.subject.required ||
    scope_gates.interest.required;

  if (!hasAnyCriteria) {
    return {
      relevant: true,
      relevance_score: 0.5,
      matches,
      scope_gates
    };
  }

  const relevant = Object.values(scope_gates).every((gate) => gate.passed);

  const relevance = Math.min(
    1,
    (matches.region.length ? 0.35 : 0) +
    (matches.domain.length ? 0.25 : 0) +
    (matches.asset.length || matches.facility.length ? 0.35 : 0) +
    (matches.route.length ? 0.25 : 0) +
    (matches.dependency.length ? 0.2 : 0) +
    (matches.industry.length ? 0.15 : 0) +
    (matches.topic.length ? 0.15 : 0)
  );

  return {
    relevant,
    relevance_score: Number(relevance.toFixed(3)),
    matches,
    scope_gates
  };
}

export function projectWorldstate(contextState, scopeInput, options = {}) {
  const scope = normalizeWorldstateScope(scopeInput);
  const asOf = new Date(options.as_of || Date.now()).toISOString();
  const rows = [];

  for (const observation of Object.values(contextState?.observations || {})) {
    const score = scoreObservationForScope(observation, scope);
    if (!score.relevant) continue;

    const materiality = Number((
      0.45 * clamp01(observation.anomaly_score, 0) +
      0.30 * clamp01(observation.reliability, 0.5) +
      0.25 * score.relevance_score
    ).toFixed(3));

    rows.push({
      observation_id: observation.observation_id,
      observed_at: observation.observed_at,
      source_family: observation.source_family,
      evidence_state: observation.evidence_state,
      provenance_refs: [...(observation.provenance_refs || [])],
      domains: [...(observation.domains || [])],
      region_keys: [...(observation.region_keys || [])],
      kind: observation.kind,
      summary: observation.summary,
      anomaly_score: observation.anomaly_score,
      relevance_score: score.relevance_score,
      materiality,
      matches: score.matches,
      scope_gates: score.scope_gates
    });
  }

  rows.sort((a,b) => b.observed_at.localeCompare(a.observed_at));

  return {
    schema: 'evercraft.worldstate.snapshot.v1',
    snapshot_id: `wsnap:${hash({scope: scope.scope_id, asOf, rows: rows.map((r) => r.observation_id)})}`,
    scope,
    as_of: asOf,
    observation_count: rows.length,
    independent_source_families: [...new Set(rows.map((r) => r.source_family))].length,
    observations: rows
  };
}

export function realityDelta(previousSnapshot, currentSnapshot, options = {}) {
  const threshold = clamp01(
    options.materiality_threshold,
    currentSnapshot?.scope?.materiality_threshold ?? 0.35
  );
  const previousIds = new Set((previousSnapshot?.observations || []).map((x) => x.observation_id));
  const current = currentSnapshot?.observations || [];

  const additions = current
    .filter((x) => !previousIds.has(x.observation_id))
    .map((x) => ({
      ...x,
      material: x.materiality >= threshold
    }));

  const material = additions.filter((x) => x.material);
  const sourceFamilies = [...new Set(material.map((x) => x.source_family))];

  return {
    schema: 'evercraft.worldstate.reality-delta.v1',
    delta_id: `wdelta:${hash({
      from: previousSnapshot?.snapshot_id || null,
      to: currentSnapshot?.snapshot_id || null,
      ids: additions.map((x) => x.observation_id),
      threshold
    })}`,
    scope_id: currentSnapshot?.scope?.scope_id || previousSnapshot?.scope?.scope_id || null,
    from_snapshot_id: previousSnapshot?.snapshot_id || null,
    to_snapshot_id: currentSnapshot?.snapshot_id || null,
    materiality_threshold: threshold,
    new_observation_count: additions.length,
    material_change_count: material.length,
    independent_material_source_families: sourceFamilies.length,
    material_changes: material,
    background_changes: additions.filter((x) => !x.material),
    rule: 'New data is not automatically a material change.'
  };
}

export function compactAgentPacket(delta, options = {}) {
  const max = Math.max(1, Math.min(100, Number(options.limit || 20)));
  return {
    schema: 'evercraft.worldstate.agent-packet.v1',
    delta_id: delta.delta_id,
    scope_id: delta.scope_id,
    material_change_count: delta.material_change_count,
    independent_material_source_families: delta.independent_material_source_families,
    changes: (delta.material_changes || []).slice(0, max).map((row) => ({
      observation_id: row.observation_id,
      observed_at: row.observed_at,
      domains: row.domains,
      region_keys: row.region_keys,
      summary: row.summary,
      evidence_state: row.evidence_state,
      source_family: row.source_family,
      provenance_refs: row.provenance_refs,
      materiality: row.materiality,
      relevance_score: row.relevance_score
    }))
  };
}
