import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePeriodProfile,resolvePeriodAppearance} from '../public/worlds/timewalk/architectural-periods.mjs';
const ledger=JSON.parse(readFileSync(new URL('../public/worlds/timewalk/yakima-1960/evidence.v1.json',import.meta.url),'utf8'));
const profile=JSON.parse(readFileSync(new URL('../public/worlds/timewalk/yakima-1960/larson-periods.v1.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(profile);

test('architectural chronology stays data-only and source-linked',()=>{
  assert.equal(validatePeriodProfile(profile,ledger),profile);
  assert.equal(profile.sceneGeometry,null);
  assert.equal(profile.mesh,null);
  assert.equal(profile.coordinates,null);
  assert.equal(profile.physicalDescription.asDocumentedYear,1984);
  assert.equal(profile.physicalDescription.exact1960DimensionsValidated,false);
});
test('1960 shows the historically prior storefront design, never the 1963 bank',()=>{
  const out=resolvePeriodAppearance(profile,ledger,1960);
  assert.equal(out.appearance,'original_corner_shopfront_configuration');
  assert.equal(out.classification,'retrospectively_inferred');
  assert.equal(out.sourceObservationYear,1984);
  assert.equal(out.directlyObservedInRequestedYear,false);
  assert.equal(out.accurateHistoricalGeometry,false);
  assert.equal(out.approvedToModifyWorld,false);
  assert.equal(out.mesh,null);
});
test('1931, 1963, 1964, 1984, 1985 are treated differently',()=>{
  assert.equal(resolvePeriodAppearance(profile,ledger,1930).appearance,'not_yet_built');
  assert.equal(resolvePeriodAppearance(profile,ledger,1931).classification,'year_level_uncertain');
  assert.equal(resolvePeriodAppearance(profile,ledger,1962).appearance,'original_corner_shopfront_configuration');
  assert.equal(resolvePeriodAppearance(profile,ledger,1963).appearance,'exact_transition_date_unknown');
  assert.equal(resolvePeriodAppearance(profile,ledger,1964).appearance,'bank_combined_shopfront_configuration');
  assert.equal(resolvePeriodAppearance(profile,ledger,1984).appearance,'bank_combined_shopfront_configuration');
  assert.equal(resolvePeriodAppearance(profile,ledger,1985).appearance,'not_verified_for_year');
});
test('alteration event, dimensions and period inference cannot be upgraded silently',()=>{
  let c=copy();
  c.physicalDescription.exact1960DimensionsValidated=true;
  assert.throws(()=>validatePeriodProfile(c,ledger),/unsupported_measurement_accuracy/);
  c=copy();c.historicalAlterations[0].calendarYear=1960;
  assert.throws(()=>validatePeriodProfile(c,ledger),/missing_1963_remodel_provenance/);
  c=copy();c.evidenceWindows[1].classification='verified_1960';
  assert.throws(()=>validatePeriodProfile(c,ledger),/overlapping_missing_or_overconfident_year_window/);
  c=copy();c.sourceIds=['missing'];
  assert.throws(()=>validatePeriodProfile(c,ledger),/missing_sources/);
});
test('all year windows must be contiguous and supported through the reported period',()=>{
  let c=copy();c.evidenceWindows[1].startYear=1935;
  assert.throws(()=>validatePeriodProfile(c,ledger),/overlapping_missing_or_overconfident_year_window/);
  c=copy();c.evidenceWindows[1].startYear=1931;
  assert.throws(()=>validatePeriodProfile(c,ledger),/overlapping_missing_or_overconfident_year_window/);
  c=copy();c.forwardUnknownAfterYear=2026;
  assert.throws(()=>validatePeriodProfile(c,ledger),/unknown_later_year_or_alteration_date/);
});
