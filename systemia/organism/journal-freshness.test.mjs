import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJournalFreshnessEvidence,
  probeJournalFreshness
} from './journal-freshness.mjs';

test('extracts the live-edition date and sitemap evidence', () => {
  const evidence = extractJournalFreshnessEvidence({
    homepage: '<main>Live edition Friday, September 25</main>',
    sitemap: '<urlset><url><lastmod>2026-09-24T17:00:00Z</lastmod></url></urlset>',
    now: new Date('2026-09-30T20:00:00Z')
  });

  assert.equal(evidence.edition_at, '2026-09-25T00:00:00.000Z');
  assert.equal(evidence.latest_at, '2026-09-25T00:00:00.000Z');
  assert.equal(evidence.latest_kind, 'live_edition');
});

test('makes a stale Journal a blocking portfolio finding after 36 hours', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    url,
    async text() {
      return url.endsWith('sitemap.xml')
        ? '<urlset><url><lastmod>2026-09-24T17:00:00Z</lastmod></url></urlset>'
        : '<main>Live edition Friday, September 25</main>';
    }
  });

  const result = await probeJournalFreshness({
    url: 'https://evercraftjournal.example',
    now: new Date('2026-09-30T20:00:00Z'),
    fetchImpl
  });

  assert.equal(result.observation.state, 'stale_blocking');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].code, 'journal_front_page_stale');
  assert.equal(result.findings[0].severity, 'high');
});

test('passes a recent edition without inventing a problem', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    url,
    async text() {
      return url.endsWith('sitemap.xml')
        ? '<urlset><url><lastmod>2026-09-30T18:30:00Z</lastmod></url></urlset>'
        : '<main>Live edition Wednesday, September 30, 2026</main>';
    }
  });

  const result = await probeJournalFreshness({
    url: 'https://evercraftjournal.example',
    now: new Date('2026-09-30T20:00:00Z'),
    fetchImpl
  });

  assert.equal(result.observation.state, 'fresh');
  assert.deepEqual(result.findings, []);
});

test('fails to unknown rather than calling undated reachable content fresh', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    url,
    async text() {
      return '<html><body>Evercraft Journal</body></html>';
    }
  });

  const result = await probeJournalFreshness({
    url: 'https://evercraftjournal.example',
    now: new Date('2026-09-30T20:00:00Z'),
    fetchImpl
  });

  assert.equal(result.observation.state, 'unknown');
  assert.equal(result.findings[0].code, 'journal_freshness_unverifiable');
});


test('makes stale Black Friday shopping metadata a blocking identity finding', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    url,
    async text() {
      return url.endsWith('sitemap.xml')
        ? '<urlset><url><lastmod>2026-09-30T19:30:00Z</lastmod></url></urlset>'
        : '<html><title>Evercraft Journal</title><meta name="description" content="Your all-in-one AI shopping assistant for Black Friday and holiday shopping."></html>';
    }
  });

  const result = await probeJournalFreshness({
    url: 'https://evercraftjournal.example',
    now: new Date('2026-09-30T20:00:00Z'),
    fetchImpl
  });

  assert.equal(result.observation.state, 'fresh');
  assert.equal(result.observation.identity_state, 'drifted');
  assert.equal(result.findings.some((row) => row.code === 'journal_public_identity_drift' && row.severity === 'high'), true);
});


test('does not false-block when legacy copy is embedded behind explicit Journal identity', async () => {
  const fetchImpl = async (url) => ({ok:true,status:200,url,async text(){return url.endsWith('sitemap.xml') ? '<urlset><url><lastmod>2026-09-30T19:30:00Z</lastmod></url></urlset>' : '<html><title>Evercraft Journal</title><body>News that moves. Ideas that become things.<script>all-in-one ai shopping assistant for black friday</script></body></html>';}});
  const result=await probeJournalFreshness({url:'https://evercraftjournal.example',now:new Date('2026-09-30T20:00:00Z'),fetchImpl});
  assert.equal(result.observation.identity_state,'expected');
  assert.equal(result.findings.some(row=>row.code==='journal_public_identity_drift'),false);
});
