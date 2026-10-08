import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'research/discovery.json'), 'utf8'));
assert.equal(manifest.schema, 'evercraft.research-discovery.v1');
assert.equal(manifest.publication_state, 'review_pending');
assert.equal(manifest.policy.noindex_until_editorial_review, true);
assert.equal(manifest.policy.no_health_or_personal_record_publication, true);
assert.equal(manifest.records.length, 3);
assert.deepEqual(
  new Set(manifest.records.map((r) => r.lane)),
  new Set(['pet_nutrition', 'medical_science', 'civic_records'])
);

const hub = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8');
assert.match(hub, /<meta name="robots" content="noindex,follow">/);
assert.ok(!/<form\b/i.test(hub), 'editorial hub should not solicit personal information');

for (const record of manifest.records) {
  assert.equal(record.review_status, 'editorial_review_pending');
  assert.equal(record.visibility, 'draft_noindex');
  assert.ok(/^https:\/\/fabric\.systemiacommandcenters\.com\/research\/[a-z0-9-]+\/$/.test(record.canonical_url));
  assert.ok(Array.isArray(record.source_urls) && record.source_urls.length >= 2);
  assert.ok(record.source_urls.every((url) => /^https:\/\//.test(url)));
  assert.ok(record.capability_route.url.startsWith('/chum/'));
  assert.match(record.capability_route.state, /discovery/);
  const local = path.join(root, 'research', record.slug, 'index.html');
  const html = fs.readFileSync(local, 'utf8');
  assert.ok(html.includes('<link rel="canonical" href="' + record.canonical_url + '">'));
  assert.ok(html.includes('<meta name="robots" content="noindex,follow">'));
  assert.ok(html.includes('Editorial status: review pending'));
  assert.ok(html.includes('capabilities have different readiness'));
  assert.ok(html.includes('viewport'));
  for (const citation of record.source_urls) {
    assert.ok(html.includes(citation.replaceAll('&', '&amp;')), 'Missing cited source in ' + record.slug);
  }
  assert.ok(!/\b(?:diagnose me|guaranteed cure|buy now|approved by OpenAI)\b/i.test(html));
  assert.ok(hub.includes('/research/' + record.slug + '/'));
}

// No research page may enter search sitemaps until editorial review and a verified public canary.
for (const file of ['sitemap.xml', 'chum/sitemap.xml', 'chum/sitemaps/answers.xml']) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  for (const record of manifest.records) {
    assert.ok(!raw.includes('/research/' + record.slug + '/'), 'Draft leaked to sitemap: ' + record.slug);
  }
}

console.log('CHUM RESEARCH ATLAS DRAFT SAFETY PASS', JSON.stringify({
  pages: manifest.records.length,
  editorial_state: manifest.publication_state,
  sitemap_leaks: 0,
  search_indexing: 'held'
}));
