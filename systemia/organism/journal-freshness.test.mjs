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
