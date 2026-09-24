import assert from 'node:assert/strict';
import { absolutizeSitemap, normalizePublicOrigin, robotsWithSitemap } from './public-doorways.mjs';

assert.equal(normalizePublicOrigin('https://example.com/foo'), 'https://example.com');
assert.equal(normalizePublicOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
assert.equal(normalizePublicOrigin('file:///tmp/nope'), '');

const source = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>/</loc></url>
  <url><loc>/chum/</loc></url>
  <url><loc>https://external.example/path</loc></url>
</urlset>
`;

const sitemap = absolutizeSitemap(source, 'https://discovery.example');
assert.ok(sitemap.includes('<loc>https://discovery.example/</loc>'));
assert.ok(sitemap.includes('<loc>https://discovery.example/chum/</loc>'));
assert.ok(sitemap.includes('<loc>https://external.example/path</loc>'));
assert.equal(sitemap.includes('<loc>/chum/</loc>'), false);

const robots = robotsWithSitemap('User-agent: *\nAllow: /\n', 'https://discovery.example');
assert.ok(robots.includes('Sitemap: https://discovery.example/sitemap.xml'));
assert.equal((robots.match(/^Sitemap:/gm) || []).length, 1);

const replaced = robotsWithSitemap(
  'User-agent: *\nAllow: /\nSitemap: https://old.example/sitemap.xml\n',
  'https://new.example'
);
assert.ok(replaced.includes('Sitemap: https://new.example/sitemap.xml'));
assert.equal(replaced.includes('old.example'), false);

assert.throws(() => absolutizeSitemap(source, ''), /public_origin_required/);
assert.throws(() => robotsWithSitemap('', 'ftp://example.com'), /public_origin_required/);

console.log(JSON.stringify({
  status: 'PASS',
  tests: 12,
  absolute_sitemap: true,
  robots_sitemap_pointer: true,
  runtime_origin_aware: true
}, null, 2));
