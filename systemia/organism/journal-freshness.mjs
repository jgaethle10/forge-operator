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

  const edition = candidates.find((row) => row.kind === 'live_edition') || null;
  const sitemapCandidates = candidates
    .filter((row) => row.kind === 'sitemap_lastmod')
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const sitemapLatest = sitemapCandidates[0] || null;

  // The homepage edition is the editorial freshness contract. A newly modified
  // archive/sitemap entry must never hide a stale front page. Sitemap time is
  // only a fallback when no explicit live-edition date is visible.
  const latest = edition || sitemapLatest;

  return {
    edition_at: edition?.at?.toISOString() || null,
    sitemap_latest_at: sitemapLatest?.at?.toISOString() || null,
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

  const homepageLower = clean(home.text).toLowerCase();
  const identityDriftMarkers = [
    'all-in-one ai shopping assistant for black friday',
    'optimize your cart for maximum savings'
  ];
  const journalIdentityMarkers = ['evercraft journal', 'news that moves. ideas that become things.'];
  const visibleIdentityText = homepageLower
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const hasExplicitJournalIdentity = home.ok &&
    visibleIdentityText.includes('news that moves. ideas that become things.');
  const hasJournalName = home.ok && visibleIdentityText.includes('evercraft journal');
  const identityDriftMarker = identityDriftMarkers.find((marker) => homepageLower.includes(marker)) || null;
  const metaTags = [...homepageLower.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const markerInPublicMetadata = identityDriftMarker
    ? metaTags.some((tag) =>
        tag.includes(identityDriftMarker) &&
        (tag.includes('name="description"') ||
         tag.includes("name='description'") ||
         tag.includes('property="og:description"') ||
         tag.includes("property='og:description'") ||
         tag.includes('name="twitter:description"') ||
         tag.includes("name='twitter:description'"))
      )
    : false;
  const identityDrift = home.ok && Boolean(identityDriftMarker) &&
    (markerInPublicMetadata || (!hasJournalName && !hasExplicitJournalIdentity));
  const hasJournalIdentity = hasJournalName || hasExplicitJournalIdentity;
  const identityFindings = identityDrift
    ? [{
        ...findingBase,
        code: 'journal_public_identity_drift',
        severity: 'high',
        detail: 'The public Journal homepage is exposing stale shopping-assistant identity/SEO copy instead of the Evercraft Journal editorial identity.',
        metadata: {
          marker_family: 'legacy_black_friday_shopping_identity'
        }
      }]
    : [];

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
    identity_state: identityDrift ? 'drifted' : (hasJournalIdentity ? 'expected' : (home.ok ? 'unverified' : 'unknown')),
    stale_after_hours: staleAfterHours,
    block_after_hours: blockAfterHours,
    state: 'unknown',
    age_hours: null
  };

  if (!home.ok && !sitemap.ok) {
    return {
      scanned: 2,
      observation,
      findings: [
        ...identityFindings,
        {
          ...findingBase,
          code: 'journal_freshness_probe_unreachable',
          severity: 'medium',
          detail: 'Systemia could not reach either the Journal homepage or sitemap, so editorial freshness cannot be verified.'
        }
      ]
    };
  }

  if (!evidence.latest_at) {
    return {
      scanned: 2,
      observation,
      findings: [
        ...identityFindings,
        {
          ...findingBase,
          code: 'journal_freshness_unverifiable',
          severity: 'medium',
          detail: 'The Journal is reachable, but Systemia could not find a dated live edition or sitemap modification timestamp. Freshness is therefore unknown, never assumed.'
        }
      ]
    };
  }

  const ageHours = Math.max(0, (now.getTime() - new Date(evidence.latest_at).getTime()) / 3_600_000);
  observation.age_hours = Number(ageHours.toFixed(2));

  if (ageHours <= staleAfterHours) {
    observation.state = 'fresh';
    return { scanned: 2, observation, findings: identityFindings };
  }

  observation.state = ageHours >= blockAfterHours ? 'stale_blocking' : 'stale_warning';
  return {
    scanned: 2,
    observation,
    findings: [
      ...identityFindings,
      {
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
      }
    ]
  };
}
