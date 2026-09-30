const DEFAULT_STALE_AFTER_HOURS = 24;
const DEFAULT_BLOCK_AFTER_HOURS = 36;

function clean(value) {
  return String(value ?? '').trim();
}

function parseDateCandidate(value, now = new Date()) {
  const raw = clean(value);
  if (!raw) return null;

  const direct = new Date(raw);
  if (Number.isFinite(direct.getTime())) return direct;

  const monthMatch = raw.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
  if (!monthMatch) return null;

  const year = Number(monthMatch[3] || now.getUTCFullYear());
  const parsed = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${year} 12:00:00 UTC`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function extractJournalFreshnessEvidence({ homepage = '', sitemap = '', now = new Date() } = {}) {
  const candidates = [];

  const editionMatch = clean(homepage).match(
    /Live edition\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i
  );
  if (editionMatch) {
    const parsed = parseDateCandidate(`${editionMatch[1]} ${editionMatch[2]}, ${editionMatch[3] || now.getUTCFullYear()}`, now);
    if (parsed) candidates.push({ kind: 'live_edition', at: parsed });
  }

  for (const match of clean(sitemap).matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)) {
    const parsed = parseDateCandidate(match[1], now);
    if (parsed) candidates.push({ kind: 'sitemap_lastmod', at: parsed });
  }

  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  const latest = candidates[0] || null;

  return {
    edition_at: candidates.find((row) => row.kind === 'live_edition')?.at?.toISOString() || null,
    sitemap_latest_at: candidates.find((row) => row.kind === 'sitemap_lastmod')?.at?.toISOString() || null,
    latest_at: latest?.at?.toISOString() || null,
    latest_kind: latest?.kind || null,
    evidence_count: candidates.length
  };
}

async function fetchText(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Evercraft-Systemia-Journal-Freshness/1.0',
        accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.1'
      },
      signal: AbortSignal.timeout(9000)
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      text: text.slice(0, 2_000_000)
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      text: '',
      error: clean(error?.name || error?.message || error)
    };
  }
}

export async function probeJournalFreshness({
  url,
  now = new Date(),
  fetchImpl = fetch,
  staleAfterHours = DEFAULT_STALE_AFTER_HOURS,
  blockAfterHours = DEFAULT_BLOCK_AFTER_HOURS
} = {}) {
  const canonical = clean(url).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(canonical)) {
    throw new TypeError('Journal freshness URL must be an http(s) URL.');
  }

  const [home, sitemap] = await Promise.all([
    fetchText(canonical + '/', fetchImpl),
    fetchText(canonical + '/sitemap.xml', fetchImpl)
  ]);

  const evidence = extractJournalFreshnessEvidence({
    homepage: home.text,
    sitemap: sitemap.text,
    now
  });

  const findingBase = {
    subject: canonical,
    evidence_refs: [
      `url:${canonical}/`,
      `url:${canonical}/sitemap.xml`
    ],
    repair_mode: 'systemia_repair',
    human_gate_required: false
  };

  const observation = {
    schema: 'evercraft.journal.freshness-observation.v1',
    observed_at: now.toISOString(),
    canonical_url: canonical,
    homepage_status: home.status,
    sitemap_status: sitemap.status,
    edition_at: evidence.edition_at,
    sitemap_latest_at: evidence.sitemap_latest_at,
    latest_at: evidence.latest_at,
    latest_kind: evidence.latest_kind,
    stale_after_hours: staleAfterHours,
    block_after_hours: blockAfterHours,
    state: 'unknown',
    age_hours: null
  };

  if (!home.ok && !sitemap.ok) {
    return {
      scanned: 2,
      observation,
      findings: [{
        ...findingBase,
        code: 'journal_freshness_probe_unreachable',
        severity: 'medium',
        detail: 'Systemia could not reach either the Journal homepage or sitemap, so editorial freshness cannot be verified.'
      }]
    };
  }

  if (!evidence.latest_at) {
    return {
      scanned: 2,
      observation,
      findings: [{
        ...findingBase,
        code: 'journal_freshness_unverifiable',
        severity: 'medium',
        detail: 'The Journal is reachable, but Systemia could not find a dated live edition or sitemap modification timestamp. Freshness is therefore unknown, never assumed.'
      }]
    };
  }

  const ageHours = Math.max(0, (now.getTime() - new Date(evidence.latest_at).getTime()) / 3_600_000);
  observation.age_hours = Number(ageHours.toFixed(2));

  if (ageHours <= staleAfterHours) {
    observation.state = 'fresh';
    return { scanned: 2, observation, findings: [] };
  }

  observation.state = ageHours >= blockAfterHours ? 'stale_blocking' : 'stale_warning';
  return {
    scanned: 2,
    observation,
    findings: [{
      ...findingBase,
      code: 'journal_front_page_stale',
      severity: ageHours >= blockAfterHours ? 'high' : 'medium',
      detail: `Journal freshness is ${ageHours.toFixed(1)} hours old, beyond the ${staleAfterHours}-hour editorial floor. Latest dated evidence: ${evidence.latest_at} (${evidence.latest_kind}).`,
      metadata: {
        latest_at: evidence.latest_at,
        latest_kind: evidence.latest_kind,
        age_hours: Number(ageHours.toFixed(2)),
        stale_after_hours: staleAfterHours,
        block_after_hours: blockAfterHours
      }
    }]
  };
}
