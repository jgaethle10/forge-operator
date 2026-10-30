import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSignalFabricCandidates } from './signal-fabric-bridge.mjs';

export const OFFICIAL_SOURCES = Object.freeze([
  {
    id: 'srs-2',
    url: 'https://public.srs.gov/2026/10/savannah-river-site-emergency-response-event-2/',
    assertions: ['Site Area Emergency at 5:39 p.m.', 'No contamination has been reported outside the affected facility.']
  },
  {
    id: 'srs-3',
    url: 'https://public.srs.gov/2026/10/savannah-river-site-emergency-response-event-news-release-3/',
    assertions: ['Site Area Emergency at 5:07 p.m.', 'terminated at 9:45 p.m.', 'no detectable levels of contamination']
  }
]);
export const ARCHIVE_URL = 'https://public.srs.gov/news-release-archive/';
const KNOWN_RELEASE_PATHS = new Set([
  '/2026/10/savannah-river-site-emergency-response-event/',
  ...OFFICIAL_SOURCES.map(source => new URL(source.url).pathname)
]);
const MAX_HTML_BYTES = 1_000_000;

function cleanHtml(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:rsquo|#8217);/gi, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOfficialHtml(url, fetchImpl) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'public.srs.gov' || parsed.protocol !== 'https:') {
    throw new Error('SOURCE_NOT_ALLOWLISTED');
  }
  const response = await fetchImpl(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'EvercraftSignalPublicSourceWatch/1.0 (read-only release audit)', 'Accept': 'text/html' }
  });
  if (!response.ok) throw new Error('HTTP_' + response.status);
  if (response.url && new URL(response.url).hostname !== 'public.srs.gov') throw new Error('REDIRECTED_SOURCE');
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error('NON_HTML_RESPONSE');
  const html = await response.text();
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('RESPONSE_TOO_LARGE');
  if (!html || !/<(?:html|article|main)\b/i.test(html)) throw new Error('UNRECOGNIZED_HTML');
  return html;
}

export function findUntrackedReleaseLinks(html) {
  const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/gi;
  const discovered = new Set();
  let match;
  while ((match = hrefRegex.exec(html))) {
    try {
      const url = new URL(match[1].replace(/&amp;/g, '&'), ARCHIVE_URL);
      if (url.protocol !== 'https:' || url.hostname !== 'public.srs.gov') continue;
      if (!/^\/2026\/10\/savannah-river-site-emergency-response-event(?:[-\w]*)?\/$/.test(url.pathname)) continue;
      if (!KNOWN_RELEASE_PATHS.has(url.pathname)) discovered.add(url.href);
    } catch { /* invalid archive links are not publishable */ }
  }
  return [...discovered].sort();
}

export async function runOfficialWatch({fetchImpl = fetch, now = new Date()} = {}) {
  const checkedAt = new Date(now).toISOString();
  const sources = [];
  for (const source of OFFICIAL_SOURCES) {
    try {
      const html = await fetchOfficialHtml(source.url, fetchImpl);
      const readable = cleanHtml(html);
      const missingAssertions = source.assertions.filter(phrase => !readable.toLowerCase().includes(phrase.toLowerCase()));
      sources.push({
        source_id: source.id,
        source_url: source.url,
        source_type: 'official_statement',
        coverage_state: 'fresh',
        assertion_state: missingAssertions.length ? 'review_required' : 'known_assertions_present',
        missing_assertions: missingAssertions,
        content_sha256: crypto.createHash('sha256').update(readable).digest('hex'),
        observation_time: checkedAt,
        independently_verified_radiation_readings: false
      });
    } catch (error) {
      sources.push({
        source_id: source.id,
        source_url: source.url,
        source_type: 'official_statement',
        coverage_state: 'unavailable',
        assertion_state: 'not_evaluated',
        error_code: String(error?.message || error).slice(0,120),
        observation_time: checkedAt,
        independently_verified_radiation_readings: false
      });
    }
  }
  let archive;
  try {
    const html = await fetchOfficialHtml(ARCHIVE_URL, fetchImpl);
    archive = {
      source_url: ARCHIVE_URL,
      coverage_state: 'fresh',
      untracked_release_candidates: findUntrackedReleaseLinks(html),
      caveat: 'Candidate URLs are links from the official archive, not verified new incidents or hazards.'
    };
  } catch (error) {
    archive = { source_url: ARCHIVE_URL, coverage_state: 'unavailable',
      error_code: String(error?.message || error).slice(0,120), untracked_release_candidates: [] };
  }
  const coverage = sources.every(row => row.coverage_state === 'fresh') && archive.coverage_state === 'fresh'
    ? 'fresh' : 'degraded';
  const reviewReasons = [
    ...sources.filter(row => row.assertion_state === 'review_required')
      .map(row => 'official_assertion_missing:' + row.source_id),
    ...archive.untracked_release_candidates.map(url => 'new_release_link_candidate:' + url)
  ];
  return {
    schema: 'evercraft.signal.official-source-watch.v1',
    checked_at: checkedAt,
    mode: 'read_only_candidate_detection',
    incident_id: 'us-sc-savannah-river-laboratory-fire-2026-10-28',
    source_coverage: coverage,
    sources,
    archive,
    review_required: reviewReasons.length > 0,
    review_reasons: reviewReasons,
    publication_authorized: false,
    customer_alerts_sent: false,
    radioactive_release_confirmed: null,
    safety_notes: [
      'An unavailable source is a coverage gap, not proof of a hazard or safety.',
      'Known assertion checks are not a full semantic diff or an independent radiological measurement.',
      'New release URLs require independent review before a public case change.',
      'Do not publish unreviewed emergency advice or changes to incident severity.'
    ]
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : null;
  if (outIndex > -1 && (!outPath || outPath.startsWith('--'))) throw new Error('--out requires a path');
  const result = await runOfficialWatch();
  result.operator_signal_candidates = buildSignalFabricCandidates(result);
  const data = JSON.stringify(result, null, 2) + '\n';
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, data, { mode: 0o600 });
  }
  process.stdout.write(data);
  if (result.source_coverage !== 'fresh') process.exitCode = 2;
}
