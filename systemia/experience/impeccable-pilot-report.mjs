// Compare a pinned third-party detector with the owned Human Experience Sentinel.
// Static HTML / CSS only. No customer input, credentials, or live websites.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHumanSurfaceHtml } from './human-experience-adapter.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const cases = [
  { id: 'headquarters_html', file: 'public/headquarters/index.html', type: 'html' },
  { id: 'headquarters_css', file: 'public/headquarters/tower.css', type: 'css' },
  { id: 'work_saban_html', file: 'public/work-saban/index.html', type: 'html' },
  { id: 'synthetic_defects', file: 'systemia/experience/fixtures/impeccable-synthetic-defects.html', type: 'html', synthetic: true }
];
const roles = ['clarity_guard', 'brand_guard', 'mobile_guard', 'accessibility_guard', 'interaction_guard', 'beauty_guard'];
function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw Error('impeccable_json_array_expected:' + path.basename(file));
  return value;
}
function ruleSummary(findings) {
  const counts = new Map();
  for (const f of findings) {
    const rule = String(f.antipattern || f.ruleId || f.rule_id || f.rule || f.id || 'unknown');
    counts.set(rule, (counts.get(rule) || 0) + 1);
  }
  return [...counts.entries()].map(([rule, count]) => ({rule, count})).sort((a,b)=>a.rule.localeCompare(b.rule));
}
export function evaluatePilot({ resultDir, rootDir = repo }) {
  const output = {
    schema: 'evercraft.experience.impeccable-comparison.v1',
    evidence_scope: 'public_source_and_synthetic_fixture_only',
    upstream: {
      project: 'pbakaus/impeccable',
      engine_version: '0.1.25',
      binary_sha256: 'f48aca43294a9ba1ea3eb7b1d0a0b2d595c480e8c65003e410247b9884820ddd'
    },
    results: [],
    interpreted_improvement_verified: false,
    rendered_browser_verified: false,
    production_adapter_enabled: false,
    learning_state: 'comparison_only'
  };
  for (const entry of cases) {
    const detected = readJson(path.join(resultDir, entry.id + '.json'));
    const content = fs.readFileSync(path.join(rootDir, entry.file), 'utf8');
    const baseline = [];
    if (entry.type === 'html') {
      for (const role of roles) {
        const result = analyzeHumanSurfaceHtml({
          html: content,
          url: 'https://example.invalid/' + entry.id,
          product: {product_key: entry.id, name: entry.synthetic ? 'Synthetic Example' : entry.id},
          role,
          contentType: 'text/html'
        });
        baseline.push(...result.findings.map(f => ({role, code:f.code, severity:f.severity})));
      }
    }
    output.results.push({
      id: entry.id,
      source_path: entry.file,
      synthetic: entry.synthetic === true,
      source_only: true,
      comparison_note: entry.type === 'css'
        ? 'Existing Evercraft HTML sentinel has no independent CSS scanner: not a like-for-like comparison.'
        : 'Baseline and upstream inspect different heuristics: counts cannot be treated as directly equivalent severity or proof of superior design.',
      owned_findings: baseline,
      owned_finding_count: baseline.length,
      upstream_finding_count: detected.length,
      upstream_rules: ruleSummary(detected),
      upstream_sample: detected.slice(0, 6).map(f => ({
        rule: String(f.antipattern || f.ruleId || f.rule_id || f.rule || f.id || 'unknown').slice(0, 120),
        name: String(f.name || '').slice(0, 160),
        severity: String(f.severity || f.level || 'unknown').slice(0, 60)
      }))
    });
  }
  output.summary = {
    scanned_source_files: output.results.length,
    owned_html_findings: output.results.reduce((n, r) => n + r.owned_finding_count, 0),
    upstream_source_findings: output.results.reduce((n, r) => n + r.upstream_finding_count, 0),
    public_source_files: output.results.filter(r => !r.synthetic).length,
    synthetic_source_files: output.results.filter(r => r.synthetic).length
  };
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultDir = process.env.EVERCRAFT_PILOT_RESULTS;
  if (!resultDir) throw Error('EVERCRAFT_PILOT_RESULTS_required');
  const result = evaluatePilot({resultDir});
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## Evercraft Impeccable source-only pilot',
      '',
      '| Public / synthetic target | Evercraft HTML findings | Impeccable findings |',
      '|---|---:|---:|'
    ];
    for (const row of result.results) {
      lines.push('| ' + row.id + (row.synthetic ? ' (synthetic)' : '') + ' | ' + row.owned_finding_count + ' | ' + row.upstream_finding_count + ' |');
    }
    lines.push('', 'Counts reflect different checksets; no equivalent severity, production readiness, or visual browser pass is implied.',
      'Exact pinned engine SHA256: ' + result.upstream.binary_sha256);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}
