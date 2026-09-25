import { createHash } from 'node:crypto';

export const ALIEV_EVIDENCE_SCHEMA = 'evercraft.aliev.evidence-package.v1';
export const LEGACY_ALIAS_SCHEMA = 'evercraft.aliev.legacy-alias.v1';

const EVIDENCE_STATES = new Set([
  'verified',
  'observed',
  'source_derived',
  'source_derived_approx',
  'modeled',
  'reported',
  'unknown'
]);

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function requireString(value, name) {
  const out = clean(value);
  if (!out) throw new Error(`${name}_required`);
  return out;
}

function normalizeEvidenceState(value) {
  const state = clean(value).toLowerCase();
  if (!EVIDENCE_STATES.has(state)) throw new Error('evidence_state_invalid');
  return state;
}

function normalizeObservation(raw, index) {
  const semantics = requireString(raw?.semantics, `observations_${index}_semantics`);
  const evidenceState = normalizeEvidenceState(raw?.evidence_state);
  const observed = raw?.observed === true;
  const modeled = raw?.modeled === true;

  if (observed && modeled) throw new Error(`observations_${index}_observed_and_modeled_conflict`);
  if (modeled && evidenceState === 'observed') throw new Error(`observations_${index}_modeled_cannot_be_observed`);
  if (observed && evidenceState === 'modeled') throw new Error(`observations_${index}_observed_cannot_be_modeled`);
  if (raw?.value === null && raw?.missing !== true) throw new Error(`observations_${index}_null_requires_missing_true`);
  if (raw?.missing === true && Number(raw?.value) === 0 && raw?.value !== null && raw?.value !== undefined) {
    throw new Error(`observations_${index}_missing_cannot_be_zero`);
  }

  return {
    observation_id: requireString(raw?.observation_id, `observations_${index}_observation_id`),
    metric: requireString(raw?.metric, `observations_${index}_metric`),
    value: raw?.value ?? null,
    unit: clean(raw?.unit) || null,
    missing: raw?.missing === true,
    semantics,
    observed,
    modeled,
    evidence_state: evidenceState,
    source: {
      record_id: requireString(raw?.source?.record_id, `observations_${index}_source_record_id`),
      authority: requireString(raw?.source?.authority, `observations_${index}_source_authority`),
      provenance: requireString(raw?.source?.provenance, `observations_${index}_source_provenance`),
      license: clean(raw?.source?.license) || null,
      geography: requireString(raw?.source?.geography, `observations_${index}_source_geography`),
      effective_at: requireString(raw?.source?.effective_at, `observations_${index}_source_effective_at`),
      captured_at: requireString(raw?.source?.captured_at, `observations_${index}_source_captured_at`)
    }
  };
}

export function createEvidencePackage(input, { now = new Date().toISOString() } = {}) {
  const observations = Array.isArray(input?.observations)
    ? input.observations.map(normalizeObservation)
    : [];
  if (!observations.length) throw new Error('observations_required');

  const derivedSignals = Array.isArray(input?.derived_signals) ? input.derived_signals.map((signal, index) => ({
    signal_id: requireString(signal?.signal_id, `derived_signals_${index}_signal_id`),
    metric: requireString(signal?.metric, `derived_signals_${index}_metric`),
    value: signal?.value ?? null,
    method: requireString(signal?.method, `derived_signals_${index}_method`),
    method_version: requireString(signal?.method_version, `derived_signals_${index}_method_version`),
    input_observation_ids: Array.isArray(signal?.input_observation_ids)
      ? signal.input_observation_ids.map((id) => requireString(id, `derived_signals_${index}_input_observation_id`))
      : []
  })) : [];

  const knownObservationIds = new Set(observations.map((row) => row.observation_id));
  for (const signal of derivedSignals) {
    if (!signal.input_observation_ids.length) throw new Error(`derived_signal_inputs_required:${signal.signal_id}`);
    for (const id of signal.input_observation_ids) {
      if (!knownObservationIds.has(id)) throw new Error(`derived_signal_input_missing:${signal.signal_id}:${id}`);
    }
  }

  const lineage = {
    legacy_aliases: Array.isArray(input?.lineage?.legacy_aliases) ? input.lineage.legacy_aliases : [],
    source_records: Array.from(new Set(observations.map((row) => row.source.record_id)))
  };

  const pkg = {
    schema: ALIEV_EVIDENCE_SCHEMA,
    package_id: null,
    generated_at: now,
    site: {
      site_id: requireString(input?.site?.site_id, 'site_id'),
      address: clean(input?.site?.address) || null
    },
    observations,
    derived_signals: derivedSignals,
    artifacts: Array.isArray(input?.artifacts) ? input.artifacts : [],
    lineage,
    quality: {
      missing_fields: observations.filter((row) => row.missing).map((row) => row.metric),
      conflicts: Array.isArray(input?.quality?.conflicts) ? input.quality.conflicts : [],
      freshness: input?.quality?.freshness ?? {},
      evidence_states: Array.from(new Set(observations.map((row) => row.evidence_state))).sort()
    }
  };

  pkg.package_id = `aliev-evidence:${digest({
    site: pkg.site,
    observations: pkg.observations,
    derived_signals: pkg.derived_signals,
    artifacts: pkg.artifacts,
    lineage: pkg.lineage
  })}`;

  return pkg;
}

export function createLegacyAlias(input) {
  const lineageState = clean(input?.lineage_state).toLowerCase();
  if (!['mapped', 'ambiguous', 'quarantined'].includes(lineageState)) {
    throw new Error('legacy_alias_lineage_state_invalid');
  }

  return {
    schema: LEGACY_ALIAS_SCHEMA,
    legacy_product: requireString(input?.legacy_product, 'legacy_product'),
    legacy_record_id: requireString(input?.legacy_record_id, 'legacy_record_id'),
    canonical_product: requireString(input?.canonical_product ?? 'aliev', 'canonical_product'),
    canonical_entity_id: lineageState === 'mapped'
      ? requireString(input?.canonical_entity_id, 'canonical_entity_id')
      : clean(input?.canonical_entity_id) || null,
    lineage_state: lineageState,
    evidence: requireString(input?.evidence, 'legacy_alias_evidence')
  };
}

export function assertRivetConsumption(packageInput) {
  if (packageInput?.schema !== ALIEV_EVIDENCE_SCHEMA) throw new Error('rivet_requires_aliev_evidence_package');
  if (!clean(packageInput?.package_id).startsWith('aliev-evidence:')) throw new Error('aliev_package_id_invalid');
  if (!Array.isArray(packageInput?.observations) || !packageInput.observations.length) throw new Error('aliev_package_observations_required');
  return {
    ok: true,
    schema: 'evercraft.rivet.aliev-consumption-receipt.v1',
    package_id: packageInput.package_id,
    site_id: packageInput.site?.site_id ?? null,
    observation_count: packageInput.observations.length,
    source_record_count: packageInput.lineage?.source_records?.length ?? 0
  };
}
