const REQUIRED_QEI_FIELDS = Object.freeze([
  'field_model',
  'state_class',
  'spacetime_dimension',
  'background_geometry',
  'sampling_curve',
  'sampling_scale',
  'bound_source',
]);

const ALLOWED_CURVES = new Set(['timelike', 'null', 'double-null']);
const ALLOWED_BACKGROUNDS = new Set([
  'minkowski',
  'curved',
  'curved-with-boundary',
  'flat-with-boundary',
]);

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

export function assessQeiReadiness(record) {
  const missing = REQUIRED_QEI_FIELDS.filter((key) => !present(record[key]));
  const warnings = [];
  const blockers = [];

  if (present(record.sampling_curve) && !ALLOWED_CURVES.has(record.sampling_curve)) {
    blockers.push('unsupported_sampling_curve');
  }

  if (
    present(record.background_geometry) &&
    !ALLOWED_BACKGROUNDS.has(record.background_geometry)
  ) {
    blockers.push('unsupported_background_geometry');
  }

  if (
    record.background_geometry === 'curved' ||
    record.background_geometry === 'curved-with-boundary'
  ) {
    if (!present(record.curvature_radius_m)) {
      blockers.push('curvature_radius_required');
    }
  }

  if (
    record.background_geometry === 'flat-with-boundary' ||
    record.background_geometry === 'curved-with-boundary'
  ) {
    if (!present(record.boundary_distance_m)) {
      blockers.push('boundary_distance_required');
    }
  }

  if (record.sampling_curve === 'null' && record.spacetime_dimension === 4) {
    warnings.push(
      'Do not assume a timelike QEI automatically supplies a null-geodesic QEI in four-dimensional Minkowski QFT.',
    );
  }

  if (record.field_model === 'unspecified' || record.state_class === 'unspecified') {
    blockers.push('quantum_field_and_state_must_be_explicit');
  }

  if (
    present(record.sampling_scale?.length_m) &&
    record.sampling_scale.length_m <= 0
  ) {
    blockers.push('sampling_length_must_be_positive');
  }

  if (
    present(record.sampling_scale?.time_s) &&
    record.sampling_scale.time_s <= 0
  ) {
    blockers.push('sampling_time_must_be_positive');
  }

  let localFlatnessRatio = null;
  if (
    present(record.sampling_scale?.length_m) &&
    present(record.curvature_radius_m)
  ) {
    localFlatnessRatio =
      record.sampling_scale.length_m / record.curvature_radius_m;
    if (localFlatnessRatio >= 0.1) {
      warnings.push(
        'Sampling length is not clearly small compared with curvature radius; a flat-spacetime bound should not be transplanted without justification.',
      );
    }
  }

  let boundaryRatio = null;
  if (
    present(record.sampling_scale?.length_m) &&
    present(record.boundary_distance_m)
  ) {
    boundaryRatio =
      record.sampling_scale.length_m / record.boundary_distance_m;
    if (boundaryRatio >= 0.1) {
      warnings.push(
        'Sampling scale is not clearly small compared with boundary distance; boundary corrections may be important.',
      );
    }
  }

  const status =
    missing.length === 0 && blockers.length === 0
      ? warnings.length === 0
        ? 'ready_for_bound_specific_analysis'
        : 'ready_with_warnings'
      : 'blocked';

  return {
    status,
    missing_fields: missing,
    blockers,
    warnings,
    diagnostics: {
      local_flatness_ratio: localFlatnessRatio,
      sampling_to_boundary_ratio: boundaryRatio,
    },
    evidence_class: 'methodological_gate',
  };
}

export function makeQeiClaim({
  claim_id,
  claim,
  field_model,
  state_class,
  spacetime_dimension,
  background_geometry,
  sampling_curve,
  sampling_scale,
  curvature_radius_m = null,
  boundary_distance_m = null,
  bound_source,
  geometry_source = null,
  notes = [],
}) {
  const record = {
    claim_id,
    claim,
    field_model,
    state_class,
    spacetime_dimension,
    background_geometry,
    sampling_curve,
    sampling_scale,
    curvature_radius_m,
    boundary_distance_m,
    bound_source,
    geometry_source,
    notes,
  };

  return {
    ...record,
    readiness: assessQeiReadiness(record),
  };
}

export const LITERATURE_GATES = Object.freeze({
  ford_roman_1995: {
    type: 'literature_anchor',
    title: 'Quantum Field Theory Constrains Traversable Wormhole Geometries',
    authors: 'L. H. Ford; Thomas A. Roman',
    year: 1995,
    arxiv: 'gr-qc/9510071',
    scope:
      'Applies a negative-energy quantum inequality to static traversable wormhole geometries and argues that macroscopic cases are forced toward Planck-scale throats or large disparities in characteristic length scales.',
    caution:
      'The applicability of a flat-spacetime QI in curved spacetime is a local approximation that depends on sampling scales being small relative to local curvature and boundary scales.',
  },
  fewster_roman_2005: {
    type: 'literature_anchor',
    title: 'Problems with wormholes which involve arbitrarily small amounts of exotic matter',
    authors: 'C. J. Fewster; T. A. Roman',
    year: 2005,
    arxiv: 'gr-qc/0510079',
    scope:
      'Uses a quantum-inequality bound on null-contracted stress energy averaged along a timelike worldline to constrain proposed traversable wormhole geometries.',
    caution:
      'A small integrated amount of exotic matter does not by itself imply a physically realizable traversable geometry.',
  },
  kontou_2024: {
    type: 'review_anchor',
    title: 'Wormhole Restrictions from Quantum Energy Inequalities',
    author: 'Eleni-Alexandra Kontou',
    year: 2024,
    doi: '10.3390/universe10070291',
    scope:
      'Reviews timelike and null quantum energy inequalities, averaged energy conditions, and constraints on short and long wormholes in semiclassical gravity.',
    caution:
      'The review emphasizes that applicability depends on field content, sampling construction, spacetime geometry, and the specific inequality being used.',
  },
});

export const CHRONOS_QEI_CANDIDATES = Object.freeze([
  makeQeiClaim({
    claim_id: 'casimir-plate-benchmark',
    claim:
      'Use ideal parallel-plate Casimir negative energy as a dimensional benchmark against a wormhole stress-energy scale.',
    field_model: 'electromagnetic field with idealized conducting boundaries',
    state_class: 'Casimir vacuum benchmark',
    spacetime_dimension: 4,
    background_geometry: 'flat-with-boundary',
    sampling_curve: 'timelike',
    sampling_scale: { length_m: null, time_s: null },
    boundary_distance_m: null,
    bound_source: 'not-yet-selected-for-this-boundary-value-problem',
    geometry_source: 'parallel-plate Casimir geometry',
    notes: [
      'Magnitude comparison is not stress-tensor equivalence.',
      'A free-scalar Minkowski QEI cannot be silently reused as an electromagnetic boundary-value QEI.',
    ],
  }),
  makeQeiClaim({
    claim_id: 'morris-thorne-short-wormhole',
    claim:
      'Test whether a short Morris-Thorne-type traversable wormhole can be supported by a specified quantum field state while satisfying the applicable averaged quantum energy bounds.',
    field_model: 'unspecified',
    state_class: 'unspecified',
    spacetime_dimension: 4,
    background_geometry: 'curved',
    sampling_curve: 'timelike',
    sampling_scale: { length_m: null, time_s: null },
    curvature_radius_m: null,
    bound_source: 'Ford-Roman / later QEI literature to be selected per field and state',
    geometry_source: 'Morris-Thorne traversable wormhole family',
    notes: [
      'Blocked until field, state, curvature scale, and sampling scale are explicit.',
      'Short wormholes relevant to time-machine construction face additional achronal-ANEC/chronology constraints.',
    ],
  }),
]);

export function summarizeQeiPortfolio(records = CHRONOS_QEI_CANDIDATES) {
  const summary = {
    total: records.length,
    blocked: 0,
    ready_with_warnings: 0,
    ready_for_bound_specific_analysis: 0,
    records: [],
  };

  for (const record of records) {
    const status = record.readiness.status;
    summary[status] += 1;
    summary.records.push({
      claim_id: record.claim_id,
      status,
      missing_fields: record.readiness.missing_fields,
      blockers: record.readiness.blockers,
      warnings: record.readiness.warnings,
    });
  }

  return summary;
}
