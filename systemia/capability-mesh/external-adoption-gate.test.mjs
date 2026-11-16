import assert from 'node:assert/strict';
import test from 'node:test';
import { compileExternalAdoption, loadExternalAdoptionCatalog } from './external-adoption-gate.mjs';

const load = () => structuredClone(loadExternalAdoptionCatalog());

test('catalogue of pinned upstream candidates is read-only, not installed', () => {
  const receipt = compileExternalAdoption(load());
  assert.equal(receipt.status, 'review_only', JSON.stringify(receipt.issues));
  assert.equal(receipt.summary.candidates, 3);
  assert.equal(receipt.summary.invalid_candidates, 0);
  assert.equal(receipt.summary.live_adapters, 0);
  assert.equal(receipt.summary.measured_benchmark_pairs, 0);
  assert.equal(receipt.production_authority_granted, false);
  assert.equal(receipt.external_code_executed, false);
  assert.ok(receipt.candidates.every(c => c.state === 'catalogued_reference_only'));
  assert.ok(receipt.candidates.every(c => c.installed === false && c.adapter_live === false));
  assert.ok(receipt.candidates.every(c => c.benchmark_state === 'unmeasured'));
});

test('revision must be fully pinned to exact upstream commit', () => {
  const c = load();
  c.candidates[0].revision = 'main';
  const out = compileExternalAdoption(c);
  assert.equal(out.status, 'invalid_catalog');
  assert.ok(out.candidates[0].static_admission_issues.includes('full_pinned_revision_required'));
});

test('reference catalog never permits authority escalation or fake installation', () => {
  const c = load();
  c.candidates[0].authority.approved_for_execution = true;
  c.candidates[0].integration_state = 'installed';
  c.candidates[1].mode = 'execute';
  const out = compileExternalAdoption(c);
  assert.equal(out.status, 'invalid_catalog');
  assert.ok(out.candidates[0].static_admission_issues.includes('candidate_authority_must_be_denied'));
  assert.ok(out.candidates[0].static_admission_issues.includes('unexpected_installed_claim'));
  assert.ok(out.candidates[1].static_admission_issues.includes('unexpected_external_execution_mode'));
  assert.equal(out.production_authority_granted, false);
});

test('duplicate or off-domain upstream entries cannot silently enter catalogue', () => {
  const c = load();
  c.candidates[1].id = c.candidates[0].id;
  c.candidates[2].upstream_url = 'https://github.example.org/mirror/impeccable';
  const out = compileExternalAdoption(c);
  assert.equal(out.status, 'invalid_catalog');
  assert.ok(out.issues.includes('candidate_ids_must_be_unique'));
  assert.ok(out.candidates[2].static_admission_issues.includes('upstream_url_must_match_github_repository'));
});

test('unmeasured performance is not counted as an improvement', () => {
  const c = load();
  c.candidates[0].benchmark.baseline = 4;
  c.candidates[0].benchmark.external_candidate = 3;
  const receipt = compileExternalAdoption(c);
  assert.equal(receipt.candidates[0].benchmark_state, 'candidate_improvement_measured_unverified');
  assert.equal(receipt.candidates[0].adapter_live, false);
  assert.equal(receipt.candidates[0].production_authorized, false);
  assert.equal(receipt.candidates[1].benchmark_state, 'unmeasured');
});

test('unsafe implicit automatic installation policy is rejected', () => {
  const c = load();
  c.policy.automatic_dependency_install = true;
  const out = compileExternalAdoption(c);
  assert.equal(out.status, 'invalid_catalog');
  assert.ok(out.issues.includes('unsafe_or_missing_policy_automatic_dependency_install'));
});
