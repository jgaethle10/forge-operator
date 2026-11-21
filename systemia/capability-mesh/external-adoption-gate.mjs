// Read-only external capability scouting/adoption policy for Evercraft Capability Mesh.
// Deliberately NOT an installer, plugin loader, live integration, or authority grant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FULL_SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const APPROVED_LICENSES = new Set(['MIT', 'Apache-2.0']);
const RISK_GATES = [
  'dependency_audit',
  'provenance_review',
  'sandbox_test',
  'license_notice_plan',
  'security_review',
  'rollback_proved'
];

const unique = values => new Set(values).size === values.length;
const text = value => String(value ?? '').trim();

function checkCandidate(candidate) {
  const issues = [];
  const id = text(candidate?.id);
  const repository = text(candidate?.repository);
  const license = text(candidate?.license_spdx);
  const revision = text(candidate?.revision);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) issues.push('invalid_candidate_id');
  if (!REPO.test(repository)) issues.push('invalid_repository_name');
  if (text(candidate?.upstream_url) !== 'https://github.com/' + repository) {
    issues.push('upstream_url_must_match_github_repository');
  }
  if (!FULL_SHA.test(revision)) issues.push('full_pinned_revision_required');
  if (!APPROVED_LICENSES.has(license)) issues.push('license_requires_review');
  if (!text(candidate?.lane) || !text(candidate?.purpose) || !text(candidate?.owned_target)) {
    issues.push('missing_capability_goal');
  }
  if (candidate?.integration_state !== 'not_installed') {
    issues.push('unexpected_installed_claim');
  }
  if (candidate?.mode !== 'reference_only') {
    issues.push('unexpected_external_execution_mode');
  }
  if (candidate?.authority?.approved_for_execution !== false ||
      candidate?.authority?.approved_for_network !== false ||
      candidate?.authority?.approved_for_customer_data !== false) {
    issues.push('candidate_authority_must_be_denied');
  }
  if (!candidate?.risk || RISK_GATES.some(key => typeof candidate.risk[key] !== 'boolean')) {
    issues.push('explicit_risk_status_required');
  }
  const m = candidate?.benchmark;
  if (!text(m?.metric) || !['lower', 'higher'].includes(m?.direction)) {
    issues.push('benchmark_metric_contract_required');
  }
  for (const key of ['baseline', 'external_candidate', 'owned_reimplementation']) {
    const value = m?.[key];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      issues.push('benchmark_' + key + '_must_be_null_or_nonnegative_number');
    }
  }
  if (candidate?.learning_loop?.owned_reimplementation_complete !== false) {
    issues.push('unverified_ownership_claim');
  }
  return issues;
}

export function compileExternalAdoption(catalog) {
  const issues = [];
  if (catalog?.schema !== 'evercraft.capability-mesh.external-adoption-catalog.v1') {
    issues.push('catalog_schema_invalid');
  }
  if (!Array.isArray(catalog?.candidates) || !catalog.candidates.length) {
    issues.push('candidates_required');
  }
  const candidates = (Array.isArray(catalog?.candidates) ? catalog.candidates : [])
    .map(candidate => {
      const blocked = checkCandidate(candidate);
      const risk = candidate?.risk || {};
      const benchmark = candidate?.benchmark || {};
      const reviewMissing = RISK_GATES.filter(gate => risk[gate] !== true);
      const measured = ['baseline', 'external_candidate'].every(key =>
        typeof benchmark[key] === 'number' && Number.isFinite(benchmark[key]));
      const better = measured && (benchmark.direction === 'lower'
        ? benchmark.external_candidate < benchmark.baseline
        : benchmark.external_candidate > benchmark.baseline);
      return {
        id: text(candidate?.id),
        upstream: text(candidate?.upstream_url),
        revision: text(candidate?.revision),
        lane: text(candidate?.lane),
        owned_target: text(candidate?.owned_target),
        source_integrity: blocked.length ? 'invalid' : 'pinned_metadata_present_not_download_verified',
        state: blocked.length ? 'invalid_manifest' : 'catalogued_reference_only',
        risk_gates_missing: reviewMissing,
        benchmark_state: measured ? (better ? 'candidate_improvement_measured_unverified' : 'no_improvement_measured') : 'unmeasured',
        static_admission_issues: blocked,
        // Passing the manifest cannot grant installation or production authority.
        usable_as_design_reference: blocked.length === 0,
        installed: false,
        sandbox_executed: false,
        adapter_live: false,
        production_authorized: false,
        public_promotion_allowed: false,
        next_action: blocked.length ? 'Repair source contract' :
          reviewMissing.length ? 'Finish bounded license/dependency/security/sandbox/rollback review' :
          !measured ? 'Collect reproducible baseline and candidate measurements' :
          better ? 'Request separately authorized scoped adapter review' : 'Retain first-party implementation'
      };
    });
  if (!unique(candidates.map(x => x.id))) issues.push('candidate_ids_must_be_unique');
  const policy = catalog?.policy || {};
  for (const flag of [
    'systemia_admission_required',
    'passport_authority_required_for_execution',
    'source_review_is_not_installation',
    'automatic_dependency_install',
    'automatic_exec',
    'automatic_publication'
  ]) {
    const expected = flag.startsWith('automatic_') ? false : true;
    if (policy[flag] !== expected) issues.push('unsafe_or_missing_policy_' + flag);
  }
  return {
    schema: 'evercraft.capability-mesh.external-adoption-review.v1',
    status: issues.length || candidates.some(c => c.static_admission_issues.length)
      ? 'invalid_catalog' : 'review_only',
    source_only: true,
    runtime_deployment_verified: false,
    external_code_executed: false,
    upstream_revision_bytes_verified: false,
    customer_data_shared: false,
    production_authority_granted: false,
    summary: {
      candidates: candidates.length,
      invalid_candidates: candidates.filter(c => c.static_admission_issues.length).length,
      live_adapters: 0,
      measured_benchmark_pairs: candidates.filter(c => c.benchmark_state !== 'unmeasured').length
    },
    issues,
    candidates
  };
}

export function loadExternalAdoptionCatalog(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'systemia/capability-mesh/external-adoption-candidates.json'), 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const review = compileExternalAdoption(loadExternalAdoptionCatalog());
  process.stdout.write(JSON.stringify(review, null, 2) + '\n');
  if (review.status === 'invalid_catalog') process.exitCode = 1;
}
