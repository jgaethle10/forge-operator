import fs from 'node:fs';
import path from 'node:path';

const FAMILY_RULES = [
  ['openai-search', /\boai-searchbot\b/i],
  ['openai-gptbot', /\bgptbot\b/i],
  ['openai-chatgpt-user', /\bchatgpt-user\b/i],
  ['anthropic-claude-search', /\bclaude-searchbot\b/i],
  ['anthropic-claude-user', /\bclaude-user\b/i],
  ['anthropic-claude', /\bclaudebot\b/i],
  ['perplexity', /\bperplexitybot\b/i],
  ['google-gemini-agent', /\bgoogle-gemininotebook\b|\bgoogle-agent\b|\bgoogle-cloudvertexbot\b/i],
  ['google-extended', /\bgoogle-extended\b/i],
  ['google-search', /\bgooglebot\b/i],
  ['microsoft-bing', /\bbingbot\b/i],
  ['apple-extended', /\bapplebot-extended\b/i],
  ['apple-search', /\bapplebot\b/i],
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function iso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('valid observation time is required');
  return date.toISOString();
}

function safePathname(value) {
  const raw = clean(value);
  if (!raw.startsWith('/')) return null;
  try {
    const parsed = new URL(raw, 'https://evercraft.invalid');
    return parsed.pathname.slice(0, 2048);
  } catch {
    return null;
  }
}

export function classifyCrawler(userAgent) {
  const ua = clean(userAgent).slice(0, 1024);
  if (!ua) return { family: null, claimed_crawler: false };
  for (const [family, pattern] of FAMILY_RULES) {
    if (pattern.test(ua)) {
      return {
        family,
        claimed_crawler: true,
        evidence_state: 'user_agent_claim_unverified',
      };
    }
  }
  return { family: null, claimed_crawler: false };
}

export function discoverySurfaceClass(pathname) {
  const value = safePathname(pathname) || '';
  if (value.startsWith('/chum/answers/doors/')) return 'answer_door';
  if (value.startsWith('/chum/intents/')) return 'intent';
  if (value.startsWith('/chum/capabilities/')) return 'capability';
  if (value.startsWith('/chum/products/')) return 'product';
  if (value.startsWith('/forensiscope/')) return 'forensiscope';
  if (value.startsWith('/.well-known/')) return 'well_known';
  if (value === '/llms.txt' || value === '/llms-full.txt') return 'llms';
  if (value.includes('sitemap')) return 'sitemap';
  if (value.startsWith('/chum/freshness')) return 'freshness';
  if (value.startsWith('/chum/hot')) return 'hot_queue';
  if (value.startsWith('/api/')) return 'api';
  return 'other';
}

export function emptyCrawlObservationState() {
  return {
    schema: 'evercraft.chum.crawl-observation-state.v1',
    updated_at: null,
    evidence_state: 'user_agent_claim_unverified',
    privacy: {
      ip_addresses_persisted: false,
      raw_user_agents_persisted: false,
    },
    families: {},
    paths: {},
  };
}

function readState(statePath) {
  if (!statePath || !fs.existsSync(statePath)) return emptyCrawlObservationState();
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (parsed?.schema !== 'evercraft.chum.crawl-observation-state.v1') return emptyCrawlObservationState();
    return parsed;
  } catch {
    return emptyCrawlObservationState();
  }
}

function writeState(statePath, state) {
  if (!statePath) return;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmp = statePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, statePath);
}

export function recordCrawlerObservation(stateInput, {
  pathname,
  userAgent,
  method = 'GET',
  status = 200,
  at = new Date(),
} = {}) {
  const state = structuredClone(stateInput || emptyCrawlObservationState());
  const crawler = classifyCrawler(userAgent);
  const route = safePathname(pathname);
  if (!crawler.claimed_crawler || !route) {
    return { state, recorded: false, reason: !route ? 'invalid_path' : 'not_claimed_crawler' };
  }

  const observedAt = iso(at);
  const family = crawler.family;
  const surfaceClass = discoverySurfaceClass(route);
  const normalizedMethod = clean(method).toUpperCase().slice(0, 16) || 'GET';
  const normalizedStatus = Number.isFinite(Number(status)) ? Number(status) : 0;

  const familyRow = state.families[family] || {
    family,
    hits: 0,
    last_seen_at: null,
    surface_classes: {},
  };
  familyRow.hits += 1;
  familyRow.last_seen_at = observedAt;
  familyRow.surface_classes[surfaceClass] = (familyRow.surface_classes[surfaceClass] || 0) + 1;
  state.families[family] = familyRow;

  const pathRow = state.paths[route] || {
    path: route,
    surface_class: surfaceClass,
    hits: 0,
    last_seen_at: null,
    families: {},
    last_status: null,
    last_method: null,
  };
  pathRow.hits += 1;
  pathRow.last_seen_at = observedAt;
  pathRow.families[family] = (pathRow.families[family] || 0) + 1;
  pathRow.last_status = normalizedStatus;
  pathRow.last_method = normalizedMethod;
  state.paths[route] = pathRow;
  state.updated_at = observedAt;

  return {
    state,
    recorded: true,
    family,
    path: route,
    surface_class: surfaceClass,
    evidence_state: crawler.evidence_state,
  };
}

export function createCrawlObservatory({ statePath = '' } = {}) {
  let state = readState(statePath);

  return {
    observe(input) {
      const result = recordCrawlerObservation(state, input);
      state = result.state;
      if (result.recorded) writeState(statePath, state);
      return { ...result, state: undefined };
    },
    snapshot() {
      return structuredClone(state);
    },
    publicSummary() {
      return crawlObservationSummary(state);
    },
  };
}

export function crawlObservationSummary(stateInput) {
  const state = stateInput || emptyCrawlObservationState();
  const families = Object.values(state.families || {})
    .map((row) => ({
      family: row.family,
      hits: Number(row.hits || 0),
      last_seen_at: row.last_seen_at || null,
      surface_classes: row.surface_classes || {},
    }))
    .sort((a, b) => b.hits - a.hits || a.family.localeCompare(b.family));

  return {
    schema: 'evercraft.chum.crawl-observation-summary.v1',
    updated_at: state.updated_at || null,
    evidence_state: 'user_agent_claim_unverified',
    truth_boundary: 'A crawler-shaped User-Agent request is an observed HTTP claim, not cryptographic proof that the named provider fetched, indexed, cited, ranked, recommended, or retained the content.',
    privacy: {
      ip_addresses_persisted: false,
      raw_user_agents_persisted: false,
    },
    claimed_crawler_families: families,
    claimed_crawler_family_count: families.length,
    observed_path_count: Object.keys(state.paths || {}).length,
    total_claimed_crawler_hits: families.reduce((sum, row) => sum + row.hits, 0),
  };
}

function seenAfterChange(observation, changedAt) {
  if (!observation?.last_seen_at || !changedAt) return false;
  const seen = Date.parse(observation.last_seen_at);
  const changed = Date.parse(changedAt);
  return Number.isFinite(seen) && Number.isFinite(changed) && seen >= changed;
}

export function buildCrawlOffensePlan({
  crawlState,
  observationState = emptyCrawlObservationState(),
  now = new Date(),
  maxTargets = 250,
} = {}) {
  if (!crawlState || crawlState.schema !== 'evercraft.chum.crawl-state.v1') {
    throw new Error('valid CHUM crawl state is required');
  }

  const current = now instanceof Date ? now : new Date(now);
  const rows = Object.values(crawlState.entries || {}).map((entry) => {
    const observation = observationState.paths?.[entry.path] || null;
    const postChangeClaim = seenAfterChange(observation, entry.last_changed);
    const changedMs = Date.parse(entry.last_changed || '');
    const ageHours = Number.isFinite(changedMs)
      ? Math.max(0, (current.getTime() - changedMs) / 3_600_000)
      : null;
    const indexNowPending = entry.content_sha256 !== entry.last_indexnow_sha256;

    let offenseScore = Number(entry.priority || 0);
    const reasons = [];

    if (!postChangeClaim) {
      offenseScore += 35;
      reasons.push('no_claimed_crawler_hit_after_change');
    } else {
      reasons.push('claimed_crawler_hit_after_change_observed');
    }

    if (ageHours !== null && ageHours >= 24 && !postChangeClaim) {
      offenseScore += 20;
      reasons.push('post_change_pickup_gap_24h');
    }

    if (indexNowPending) {
      offenseScore += 15;
      reasons.push('indexnow_pending');
    }

    return {
      path: entry.path,
      base_priority: Number(entry.priority || 0),
      offense_score: offenseScore,
      last_changed: entry.last_changed || null,
      claimed_last_seen_at: observation?.last_seen_at || null,
      claimed_families: Object.keys(observation?.families || {}).sort(),
      indexnow_pending: indexNowPending,
      evidence_state: observation ? 'user_agent_claim_unverified' : 'no_observation',
      reasons,
    };
  });

  rows.sort((a, b) =>
    b.offense_score - a.offense_score ||
    String(b.last_changed || '').localeCompare(String(a.last_changed || '')) ||
    a.path.localeCompare(b.path)
  );

  const targets = rows.slice(0, Math.max(1, Math.min(5000, Number(maxTargets) || 250)));
  return {
    schema: 'evercraft.chum.crawl-offense-plan.v1',
    generated_at: iso(current),
    coordinator: 'CHUM Sonar',
    observation_evidence_state: 'user_agent_claim_unverified',
    target_count: targets.length,
    targets,
    doctrine: {
      claimed_hits_do_not_prove_indexing: true,
      absence_can_increase_pressure: true,
      claimed_hits_never_create_payment_or_provider_pickup_proof: true,
      crawler_pressure_remains_bounded: true,
    },
  };
}
