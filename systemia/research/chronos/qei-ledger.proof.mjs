import assert from 'node:assert/strict';
import {
  CHRONOS_QEI_CANDIDATES,
  LITERATURE_GATES,
  assessQeiReadiness,
  makeQeiClaim,
  summarizeQeiPortfolio,
} from './qei-ledger.mjs';

assert.ok(LITERATURE_GATES.ford_roman_1995);
assert.ok(LITERATURE_GATES.fewster_roman_2005);
assert.ok(LITERATURE_GATES.kontou_2024);

const defaultSummary = summarizeQeiPortfolio();
assert.equal(defaultSummary.total, 2);
assert.equal(defaultSummary.blocked, 2);

const casimir = CHRONOS_QEI_CANDIDATES.find(
  (record) => record.claim_id === 'casimir-plate-benchmark',
);
assert.ok(casimir);
assert.equal(casimir.readiness.status, 'blocked');
assert.ok(
  casimir.readiness.blockers.includes('boundary_distance_required'),
);

const morris = CHRONOS_QEI_CANDIDATES.find(
  (record) => record.claim_id === 'morris-thorne-short-wormhole',
);
assert.ok(morris);
assert.equal(morris.readiness.status, 'blocked');
assert.ok(
  morris.readiness.blockers.includes(
    'quantum_field_and_state_must_be_explicit',
  ),
);
assert.ok(morris.readiness.blockers.includes('curvature_radius_required'));

const readyFlat = makeQeiClaim({
  claim_id: 'flat-control',
  claim: 'Apply a bound in the same flat-space field/state domain in which it was derived.',
  field_model: 'free minimally coupled massless scalar',
  state_class: 'Hadamard',
  spacetime_dimension: 4,
  background_geometry: 'minkowski',
  sampling_curve: 'timelike',
  sampling_scale: { length_m: 1e-3, time_s: 1e-12 },
  bound_source: 'specified timelike Minkowski QEI',
});
assert.equal(
  readyFlat.readiness.status,
  'ready_for_bound_specific_analysis',
);

const localCurved = makeQeiClaim({
  claim_id: 'local-curved-control',
  claim: 'Check local-flatness bookkeeping before applying a flat-space-inspired bound.',
  field_model: 'free minimally coupled massless scalar',
  state_class: 'Hadamard',
  spacetime_dimension: 4,
  background_geometry: 'curved',
  sampling_curve: 'timelike',
  sampling_scale: { length_m: 1e-4, time_s: 1e-12 },
  curvature_radius_m: 10,
  bound_source: 'specified bound with local-curvature applicability argument',
});
assert.equal(
  localCurved.readiness.status,
  'ready_for_bound_specific_analysis',
);
assert.ok(
  localCurved.readiness.diagnostics.local_flatness_ratio < 1e-4,
);

const badCurvatureScale = assessQeiReadiness({
  field_model: 'free scalar',
  state_class: 'Hadamard',
  spacetime_dimension: 4,
  background_geometry: 'curved',
  sampling_curve: 'timelike',
  sampling_scale: { length_m: 1, time_s: 1e-9 },
  curvature_radius_m: 2,
  bound_source: 'example bound',
});
assert.equal(badCurvatureScale.status, 'ready_with_warnings');
assert.ok(
  badCurvatureScale.warnings.some((warning) =>
    warning.includes('curvature radius'),
  ),
);

const null4d = assessQeiReadiness({
  field_model: 'free minimally coupled massless scalar',
  state_class: 'Hadamard',
  spacetime_dimension: 4,
  background_geometry: 'minkowski',
  sampling_curve: 'null',
  sampling_scale: { length_m: 1, time_s: 1e-9 },
  bound_source: 'candidate null bound',
});
assert.equal(null4d.status, 'ready_with_warnings');
assert.ok(
  null4d.warnings.some((warning) =>
    warning.includes('null-geodesic QEI'),
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      mission: 'CHRONOS-001',
      milestone: 'QEI assumption gate',
      default_portfolio: defaultSummary,
      controls: {
        flat: readyFlat.readiness,
        local_curved: localCurved.readiness,
        bad_curvature_scale: badCurvatureScale,
        null_4d: null4d,
      },
      conclusion:
        'Negative-energy claims are blocked unless the field, state, spacetime, sampling curve/scale, geometry scales, and bound source are explicit. CHRONOS no longer allows a scalar negative-energy magnitude to stand in for QEI compatibility.',
    },
    null,
    2,
  ),
);
