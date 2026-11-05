import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SOURCES, findUntrackedReleaseLinks, runOfficialWatch } from '../systemia/signal-publication/official-watch.mjs';

const html = body => '<!doctype html><html><head><title>SRS</title></head><body><main>' + body + '</main></body></html>';
const release1 = html('<h1>News Release #1</h1><p>An event is in progress. At this time, there is no indication of a consequence beyond the Savannah River Site boundaries.</p>');
const release2 = html('<h1>News Release #2</h1><p>Site Area Emergency at 5:39 p.m. No contamination has been reported outside the affected facility.</p>');
const release3 = html('<h1>News Release #3</h1><p>Site Area Emergency at 5:07 p.m. The emergency was terminated at 9:45 p.m. Radiological surveys indicated no detectable levels of contamination.</p>');
const archive = html('<a href="/2026/10/savannah-river-site-emergency-response-event/">Release 1</a><a href="/2026/10/savannah-river-site-emergency-response-event-2/">Release 2</a><a href="/2026/10/savannah-river-site-emergency-response-event-news-release-3/">Release 3</a>');

function fixtureFetch(map) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /EvercraftSignal/);
    assert.ok(url.startsWith('https://public.srs.gov/'));
    const value = map[url];
    if (value == null) return new Response('Not found', { status: 404, headers: {'content-type':'text/html'} });
    if (value instanceof Response) return value;
    return new Response(value, { status: 200, headers: {'content-type':'text/html; charset=utf-8'} });
  };
}
const urls = OFFICIAL_SOURCES.map(x => x.url);
const base = Object.fromEntries([[urls[0], release2], [urls[1],release3], [urls[2],release1], ['https://public.srs.gov/news-release-archive/', archive]]);

test('official read-only check preserves provenance, uncertainty and no-alert boundary', async () => {
  const result = await runOfficialWatch({fetchImpl:fixtureFetch(base),now:'2026-10-30T16:00:00Z'});
  assert.equal(result.source_coverage,'fresh');
  assert.equal(result.review_required,false);
  assert.equal(result.publication_authorized,false);
  assert.equal(result.customer_alerts_sent,false);
  assert.equal(result.radioactive_release_confirmed,null);
  assert.equal(result.sources.length,3);
  assert.equal(result.sources[0].assertion_state,'known_assertions_present');
  assert.equal(result.sources[1].assertion_state,'known_assertions_present');
  assert.equal(result.sources[2].assertion_state,'known_assertions_present');
  assert.equal(result.sources[1].content_sha256.length,64);
  assert.equal(result.sources[1].independently_verified_radiation_readings,false);
});

test('new official archive link only creates a review candidate', async () => {
  const next=archive.replace('</main>', '<a href="https://public.srs.gov/2026/10/savannah-river-site-emergency-response-event-news-release-4/">New</a></main>');
  const result=await runOfficialWatch({fetchImpl:fixtureFetch({...base, 'https://public.srs.gov/news-release-archive/':next})});
  assert.equal(result.review_required,true);
  assert.equal(result.archive.untracked_release_candidates.length,1);
  assert.equal(result.publication_authorized,false);
  assert.equal(result.radioactive_release_confirmed,null);
});

test('syndicated and off-domain links do not count as new official releases', () => {
  const candidate=archive.replace('</main>', '<a href="https://evil.example/2026/10/savannah-river-site-emergency-response-event-4/">copy</a></main>');
  assert.deepEqual(findUntrackedReleaseLinks(candidate),[]);
});

test('deleted or edited official assertion triggers review without hazard inference', async () => {
  const changed=release3.replace('no detectable levels of contamination', 'monitoring review continues');
  const result=await runOfficialWatch({fetchImpl:fixtureFetch({...base,[urls[1]]:changed})});
  assert.equal(result.review_required,true);
  assert.deepEqual(result.sources[1].missing_assertions,['no detectable levels of contamination']);
  assert.equal(result.radioactive_release_confirmed,null);
  assert.equal(result.publication_authorized,false);
});

test('unavailable sources are coverage gaps, never proof of safety', async () => {
  const result=await runOfficialWatch({fetchImpl:fixtureFetch({...base,[urls[0]]:new Response('error',{status:503,headers:{'content-type':'text/html'}})})});
  assert.equal(result.source_coverage,'degraded');
  assert.equal(result.sources[0].coverage_state,'unavailable');
  assert.equal(result.sources[0].assertion_state,'not_evaluated');
  assert.equal(result.review_required,false);
  assert.equal(result.sources[0].content_sha256,undefined);
  assert.equal(result.radioactive_release_confirmed,null);
});

test('non-html response degrades coverage, never promotes data', async () => {
  const result=await runOfficialWatch({fetchImpl:fixtureFetch({...base,[urls[1]]:new Response('{}',{headers:{'content-type':'application/json'}})})});
  assert.equal(result.source_coverage,'degraded');
  assert.equal(result.sources[1].error_code,'NON_HTML_RESPONSE');
});

test('publisher has fixed official URLs, never user-supplied scraper endpoints', () => {
  assert.ok(OFFICIAL_SOURCES.every(x => new URL(x.url).hostname === 'public.srs.gov'));
});
