import fs from 'node:fs';
import path from 'node:path';

// Read-only external release probe. On a PR, production may still run old code.
// Distinguish deployed, absent, broken, and unreachable rather than treating a 404 as a launch.
const base = 'https://fabric.systemiacommandcenters.com';
const routes = [
  { name: 'health', path: '/health', require200: true },
  { name: 'root_sitemap', path: '/sitemap.xml', require200: true, requireAbsoluteLoc: true },
  { name: 'segmented_sitemap', path: '/chum/sitemaps/answers.xml', require200: false, requireAbsoluteLoc: true },
  { name: 'segmented_index', path: '/chum/sitemaps/index.xml', require200: false, requireAbsoluteLoc: true },
  { name: 'research_preview', path: '/research/', require200: false, requireNoindex: true },
];
const capturedAt = new Date().toISOString();
const results = [];
for (const route of routes) {
  const url = base + route.path;
  const record = { name: route.name, url, state: 'unverified', status: null, error: null };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8500), redirect: 'manual', headers: { 'user-agent': 'EvercraftResearchEdgeProof/1.0 (+public-read-only)' } });
    record.status = response.status;
    record.final_url = response.url;
    record.x_robots_tag = response.headers.get('x-robots-tag');
    if (response.status === 404) {
      record.state = 'not_deployed_or_missing';
    } else if (!response.ok) {
      record.state = 'http_error';
    } else {
      const body = await response.text();
      if (route.requireAbsoluteLoc) {
        const locs = [...body.matchAll(/<loc>([^<]+)<\\/loc>/g)].map(m => m[1]);
        record.location_count = locs.length;
        record.relative_locations = locs.filter(loc => !/^https:\\/\\//i.test(loc)).length;
        record.state = locs.length && !record.relative_locations ? 'absolute_urls_verified' : 'invalid_sitemap_locations';
      } else if (route.requireNoindex) {
        const noindex = /\\bnoindex\\b/i.test(record.x_robots_tag || '') || /<meta\\s+name=["']robots["']\\s+content=["'][^"']*noindex/i.test(body);
        record.state = noindex ? 'draft_noindex_verified' : 'draft_indexable_blocker';
      } else {
        record.state = 'reachable';
      }
    }
  } catch (error) {
    record.state = 'unreachable';
    record.error = String(error?.message || error).slice(0, 240);
  }
  results.push(record);
}
const required = results.filter(x => x.name === 'health' || x.name === 'root_sitemap');
const sourceGateOk = required.every(x => x.state === 'reachable' || x.state === 'absolute_urls_verified');
const segmented = results.filter(x => x.name === 'segmented_sitemap' || x.name === 'segmented_index');
const releaseVerified = sourceGateOk && segmented.every(x => x.state === 'absolute_urls_verified') && results.find(x => x.name === 'research_preview')?.state === 'draft_noindex_verified';
const state = releaseVerified ? 'external_release_verified_draft_noindex' : 'deployment_or_public_edge_gates_outstanding';
const report = {
  schema: 'evercraft.research-discovery.external-probe.v1',
  observed_at: capturedAt,
  expected_base: base,
  read_only: true,
  state,
  release_verified: releaseVerified,
  search_indexed: 'not_measured',
  llm_pickup: 'not_measured',
  payment_or_conversion: 'not_measured',
  results,
};
const dir = path.join('artifacts', 'chum');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'research-edge-probe.json'), JSON.stringify(report, null, 2) + '\\n');
console.log(JSON.stringify(report, null, 2));
const summary = [
  '## Research-to-Fabric external production probe',
  '',
  '**State:** ' + state,
  '',
  '| Route | HTTP | Evidence |',
  '| --- | --- | --- |',
  ...results.map(r => '| ' + r.name + ' | ' + (r.status ?? 'network error') + ' | ' + r.state + ' |'),
  '',
  'An external probe is not indexing, search impressions, external LLM recommendation or payment evidence.',
  'A draft PR does not itself deploy the code. Missing preview routes are not counted as an approved release.',
  ''
].join('\\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
