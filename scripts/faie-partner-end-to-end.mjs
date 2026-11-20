#!/usr/bin/env node
// Partner release gate: real public, bounded, ephemeral FAIE requests; no private data or mutations.
// --require-ui-parity additionally proves the deployed owned HTML exactly matches this revision.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const origin = (process.env.EVERCRAFT_OPERATOR_EDGE_ORIGIN || 'https://fabric.systemiacommandcenters.com').replace(/\/+$/, '');
const expected = 'https://fabric.systemiacommandcenters.com';
if (origin !== expected) throw new Error('partner_gate_requires_canonical_owned_origin');
const requireUiParity = process.argv.includes('--require-ui-parity');
const source = readFileSync(new URL('../public/faie/index.html', import.meta.url));
const sha256 = (body) => createHash('sha256').update(body).digest('hex');
const receipt = {
  schema: 'evercraft.faie.partner-e2e.v1',
  observed_at: new Date().toISOString(),
  origin,
  require_ui_parity: requireUiParity,
  stage: 'start',
  technical_e2e_passed: false,
  ready_for_outreach: false,
  partner_evidence_scope: 'not_yet_assessed',
  public_requests_are_ephemeral: true,
  checks: {}
};

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(origin + path, {
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
        'user-agent': 'Evercraft-FAIE-Partner-End-to-End/1.0',
        ...options.headers
      },
      ...options,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(path + '_http_' + response.status);
    return { response, body: Buffer.from(await response.arrayBuffer()) };
  } finally {
    clearTimeout(timeout);
  }
}
async function json(path, payload) {
  const options = payload === undefined ? {} : {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
  const response = await request(path, options);
  let data;
  try { data = JSON.parse(response.body.toString('utf8')); }
  catch { throw new Error(path + '_invalid_json'); }
  return data;
}
function check(value, name) {
  if (!value) throw new Error(name);
  receipt.checks[name] = true;
}

try {
  receipt.stage = 'public_pages';
  for (const path of ['/faie/', '/faie/agnormal/']) {
    const { response, body } = await request(path);
    const html = body.toString('utf8');
    check(/^text\/html/i.test(response.headers.get('content-type') || ''), 'html_content_type_' + path);
    check(html.includes('id="form"') && html.includes('id="result"'), 'interactive_forms_' + path);
    check(html.includes('Prepared for AgNormal'), 'partner_identity_' + path);
    check(html.includes('human review') && html.includes('evidence'), 'evidence_boundary_' + path);
    if (requireUiParity) {
      check(sha256(body) === sha256(source), 'source_live_parity_' + path);
      check(html.includes('id="heroTryExample"'), 'one_click_example_' + path);
      check(html.includes('id="advancedScope"'), 'optional_advanced_scope_' + path);
      check(html.includes('Make better decisions with real-world evidence'), 'plain_language_intro_' + path);
      check(html.includes('FAIE FIRST-THREE-SECONDS ONBOARDING 2026-11-19'), 'onboarding_build_' + path);
    }
  }
  receipt.stage = 'live_health';
  const before = await json('/api/faie/health');
  check(before.ok === true && before.fabric_native === true, 'owned_engine_healthy');
  check(before.base44_transport_enabled === false, 'no_base44_runtime');
  check(before.public_preview_persists_queries === false, 'public_preview_ephemeral');
  check(before.decision_authority === false && before.publication_authority === false, 'no_automated_decision_authority');
  check(Number(before.signal_count) > 0, 'live_admitted_signals');
  receipt.health = {
    signal_count: before.signal_count,
    observation_count: before.observation_count,
    official_collectors: before.official_collectors?.healthy_source_count ?? null,
    investigation_count: before.investigation_count ?? null,
    comparison_count: before.comparison_count ?? null
  };

  receipt.stage = 'real_water_investigation';
  const inv = await json('/api/faie/investigate', {
    question: 'What current evidence could materially weaken reliance on Yakima Valley water availability for regionally scaled food production?',
    region_keys: ['yakima-wa'],
    asset_types: ['regional food production infrastructure'],
    crop: 'mixed high-value food production',
    water_source: 'Yakima River Basin irrigation and groundwater',
    thesis_assumptions: [
      'Regional water availability can support the target production system.',
      'Site-specific water rights and reliability still require direct verification.'
    ],
    horizon_days: 90
  });
  check(inv.schema === 'evercraft.faie.investigation.v1', 'investigation_schema');
  check(Array.isArray(inv.findings) && inv.findings.length > 0, 'real_findings_returned');
  check(Array.isArray(inv.unknowns) && inv.unknowns.length > 0, 'unknowns_not_suppressed');
  check(Array.isArray(inv.evidence_acquisition_queue) && inv.evidence_acquisition_queue.length > 0, 'next_proof_queue');
  check(inv.decision_packet?.framework === 'SENSE_CHALLENGE_DECIDE', 'decision_packet_framework');
  check(inv.decision_packet?.decide?.human_review_required === true && inv.decision_authority === false, 'human_review_gate');
  const water = inv.findings.filter((row) => Array.isArray(row.dimensions) && row.dimensions.includes('water'));
  check(water.length > 0, 'actual_water_evidence');
  const waterWithLinks = water.filter((row) => Array.isArray(row.provenance_refs) &&
    row.provenance_refs.some((ref) => /^https?:\/\//.test(String(ref || ''))));
  check(waterWithLinks.length > 0, 'water_source_lineage');
  // A USDM county drought caution mentions soil/water-right limitations.
  // That negative statement cannot be counted as actual soil evidence.
  check(!inv.findings.some((row) =>
    row.source_family === 'us-drought-monitor-ndmc' &&
    (row.dimensions || []).some((dimension) => ['soil','crop_health'].includes(dimension))
  ), 'usdm_drought_not_misclassified_as_soil_or_crop_evidence');
  receipt.investigation = {
    status: inv.status,
    findings: inv.findings.length,
    water_findings: water.length,
    water_source_linked: waterWithLinks.length,
    source_families: [...new Set(water.map((row) => row.source_family).filter(Boolean))],
    all_source_families: [...new Set(inv.findings.map((row) => row.source_family).filter(Boolean))],
    covered_dimensions: inv.coverage?.covered_dimensions ?? [],
    unknowns: inv.unknowns.length,
    next_proof: inv.evidence_acquisition_queue.length,
    decision_readiness: inv.coverage?.decision_readiness ?? null
  };

  receipt.stage = 'real_comparison';
  const comp = await json('/api/faie/compare', {
    question: 'Compare available evidence and gaps for regional food-production infrastructure in Yakima Valley and Tri-Cities.',
    asset_types: ['regional food production infrastructure'],
    horizon_days: 90,
    candidates: [
      { label: 'Yakima Valley', region_keys: ['yakima-wa'] },
      { label: 'Tri-Cities', region_keys: ['tri-cities-wa'] }
    ]
  });
  check(comp.schema === 'evercraft.faie.comparison.v1', 'comparison_schema');
  check(comp.candidate_count === 2 && comp.candidates?.length === 2, 'two_candidate_comparison');
  check(comp.candidates.every((row) => row.site_suitability_verdict === null && row.investment_recommendation === null), 'no_fake_site_verdict');
  check(comp.decision_authority === false && comp.publication_authority === false, 'comparison_human_boundary');
  check(Array.isArray(comp.evidence_readiness_order) && comp.evidence_readiness_order.length === 2, 'comparison_same_rubric');
  receipt.comparison = {
    candidate_labels: comp.candidates.map((row) => row.label),
    evidence_order: comp.evidence_readiness_order,
    candidate_source_coverage: comp.candidates.map((row) => ({label:row.label, independent_source_family_count:row.independent_source_family_count, evidence_readiness_score:row.evidence_readiness_score})),
    decision_authority: false
  };

  receipt.stage = 'no_public_archive_write';
  const after = await json('/api/faie/health');
  check(after.public_preview_persists_queries === false, 'privacy_boundary_still_enforced');
  if (before.investigation_count !== undefined && after.investigation_count !== undefined) {
    check(before.investigation_count === after.investigation_count, 'no_public_investigation_persist');
  }
  if (before.comparison_count !== undefined && after.comparison_count !== undefined) {
    check(before.comparison_count === after.comparison_count, 'no_public_comparison_persist');
  }

  receipt.stage = 'passed';
  receipt.technical_e2e_passed = true;
  const families = receipt.investigation.all_source_families;
  const dimensions = receipt.investigation.covered_dimensions;
  const enoughSourceFamilies = families.length >= 2;
  const enoughDimensions = dimensions.length >= 2;
  // This threshold describes a multi-domain evidence pilot, not a site-quality verdict.
  // A working button and one USGS feed must NEVER be conflated with broad partnership fitness.
  receipt.partner_evidence_scope = {
    scope: 'regional_food_infrastructure',
    source_families_observed: families,
    dimensions_observed: dimensions,
    independent_family_requirement_met: enoughSourceFamilies,
    cross_dimension_requirement_met: enoughDimensions,
    comparison_has_two_evidenced_regions: receipt.comparison.candidate_source_coverage.every((row) => Number(row.independent_source_family_count) > 0),
    limitations: [
      ...(!enoughSourceFamilies ? ['Fewer than two independent evidence source families in the real pilot report.'] : []),
      ...(!enoughDimensions ? ['The real pilot report has not shown evidence across at least two different physical/operating dimensions.'] : []),
      ...(!receipt.comparison.candidate_source_coverage.every((row) => Number(row.independent_source_family_count) > 0) ? ['The sample comparison includes a region without matching admitted evidence.'] : [])
    ]
  };
  receipt.ready_for_outreach = requireUiParity && enoughSourceFamilies && enoughDimensions && receipt.partner_evidence_scope.comparison_has_two_evidenced_regions;
  receipt.state = requireUiParity ? 'PARTNER_TECHNICAL_GATE_PASSED' : 'ENGINE_VALIDATED_UI_DEPLOY_PENDING';
} catch (error) {
  receipt.stage_failed = receipt.stage;
  receipt.stage = 'failed';
  receipt.state = 'PARTNER_GATE_HOLD';
  receipt.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
}
receipt.receipt_sha256 = sha256(JSON.stringify(receipt));
process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
