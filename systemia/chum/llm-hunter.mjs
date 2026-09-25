import fs from 'node:fs';
import crypto from 'node:crypto';

const offline = process.argv.includes('--offline');
const strict = process.argv.includes('--strict');
const now = new Date();
const artifactsDir = 'artifacts/chum';
fs.mkdirSync(artifactsDir, { recursive: true });

const readJson = (path, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return fallback; }
};

const providerMatrix = readJson('chum-probes/provider-matrix.json', { providers: [] });
const probeSuite = readJson('chum-probes/probe-suite.json', { cases: [] });
const machineCatalog = readJson('public/.well-known/evercraft-machine-catalog.json', { offers: [] });
const revenueFormation = readJson('artifacts/saban-revenue/latest.json', null);

const positiveCases = (probeSuite.cases || []).filter((x) => x.enabled && x.expected_fit);
const sellNowOffers = (machineCatalog.offers || []).filter((x) => x.commercial_state === 'sell_now');

const githubQueries = [
  'model context protocol marketplace',
  'mcp client ai agent',
  'ai agent marketplace tools',
  'llm tools directory',
  'agent tool registry',
  'ai plugin marketplace'
];

const token = process.env.GITHUB_TOKEN || '';
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'Evercraft-CHUM-Hunter/1.0 (+public-ecosystem-recon)',
  ...(token ? { authorization: `Bearer ${token}` } : {})
};

const fetchJson = async (url, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status, body: null };
    return { ok: true, status: response.status, body: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const decodeReadme = (payload) => {
  try {
    if (!payload?.content || payload?.encoding !== 'base64') return '';
    return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch {
    return '';
  }
};

const submissionSignals = (text) => {
  const value = String(text || '');
  const checks = [
    ['submission', /submit|submission|add (?:your|a) (?:tool|server|agent|plugin)|list (?:your|a)/i],
    ['registry', /registry|directory|catalog/i],
    ['marketplace', /marketplace|plugin store|tool store/i],
    ['mcp', /model context protocol|\bmcp\b/i],
    ['agent_tools', /agent tools?|tool calling|plugins?/i]
  ];
  return checks.filter(([, re]) => re.test(value)).map(([name]) => name);
};

const scoreCandidate = ({ repo, readme = '' }) => {
  const haystack = `${repo.name || ''} ${repo.description || ''} ${readme}`.toLowerCase();
  let score = 0;
  if (/model context protocol|\bmcp\b/.test(haystack)) score += 28;
  if (/registry|directory|catalog|marketplace/.test(haystack)) score += 24;
  if (/agent|llm|ai assistant|tool calling/.test(haystack)) score += 18;
  if (/submit|add your|list your|contribut/.test(haystack)) score += 14;
  const stars = Number(repo.stargazers_count || 0);
  score += Math.min(10, Math.round(Math.log10(stars + 1) * 3));
  const updated = Date.parse(repo.updated_at || '');
  if (Number.isFinite(updated)) {
    const ageDays = Math.max(0, (Date.now() - updated) / 86400000);
    if (ageDays <= 30) score += 6;
    else if (ageDays <= 180) score += 3;
  }
  return Math.min(100, score);
};

const discovered = [];
const errors = [];

if (!offline) {
  const seen = new Set();
  for (const query of githubQueries) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=8`;
    const result = await fetchJson(url);
    if (!result.ok) {
      errors.push({ lane: 'github_ecosystem_search', query, status: result.status, error: result.error || null });
      continue;
    }
    for (const repo of result.body?.items || []) {
      if (!repo?.full_name || seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      const readmeResult = await fetchJson(`https://api.github.com/repos/${repo.full_name}/readme`);
      const readme = readmeResult.ok ? decodeReadme(readmeResult.body) : '';
      const signals = submissionSignals(`${repo.description || ''}\n${readme.slice(0, 20000)}`);
      const score = scoreCandidate({ repo, readme });
      discovered.push({
        ecosystem_id: `github:${repo.full_name}`,
        source: 'github_public_recon',
        name: repo.full_name,
        description: repo.description || null,
        url: repo.html_url,
        homepage: repo.homepage || null,
        stars: Number(repo.stargazers_count || 0),
        updated_at: repo.updated_at || null,
        submission_signals: signals,
        attack_score: score,
        state: score >= 70 ? 'engage_now' : score >= 50 ? 'recon_next' : 'watch',
        next_actions: [
          'Inspect the public contribution/submission path and terms.',
          'Map which machine-readable surfaces the ecosystem consumes.',
          'Publish or submit only through legitimate public developer/registry paths when authorized.',
          'Run a clean brand-blind pain probe after publication and store a receipt.',
          'Feed misses back into CHUM discovery repair; never message end users automatically.'
        ]
      });
    }
  }
}

discovered.sort((a, b) => b.attack_score - a.attack_score || b.stars - a.stars);

const knownProviders = (providerMatrix.providers || []).map((provider) => ({
  ecosystem_id: `provider:${provider.provider}`,
  source: 'authorized_provider_matrix',
  name: provider.provider,
  surface: provider.surface,
  execution: provider.execution,
  state: 'engage_now',
  next_actions: [
    'Run rotating clean-session brand-blind pain probes.',
    'Measure citations, host pickup and product mention with receipts.',
    'Repair discovery surfaces immediately after a miss.',
    'Keep machine-commerce and human-confirmed checkout routes healthy.'
  ]
}));

const hourIndex = Math.floor(now.getTime() / 3600000);
const caseById = new Map(positiveCases.map((c) => [c.case_id, c]));
const prioritizedCaseIds = [...new Set(
  (revenueFormation?.focus_rotation || [])
    .flatMap((row) => Array.isArray(row?.probe_case_ids) ? row.probe_case_ids : [])
    .filter(Boolean)
)];
const prioritizedCases = prioritizedCaseIds.map((id) => caseById.get(id)).filter(Boolean);
const rotationPool = prioritizedCases.length ? prioritizedCases : positiveCases;
const rotationCase = rotationPool.length ? rotationPool[hourIndex % rotationPool.length] : null;

const receipt = {
  schema: 'evercraft.chum.llm-hunter.receipt.v1',
  generated_at: now.toISOString(),
  mode: offline ? 'offline' : 'active_public_recon',
  doctrine: {
    mission: 'Hunt LLM and agent ecosystems, not individual humans. Find legitimate machine-discovery entrances, push truthful Evercraft capability surfaces into those entrances, verify pickup, repair misses and repeat.',
    active_distribution: true,
    no_human_spam: true,
    no_unsolicited_email: true,
    no_captcha_or_access_control_bypass: true,
    no_fake_provider_pickup: true,
    no_silent_payment: true,
    explicit_human_confirmation_for_payment: true,
    internal_revenue_priorities_not_published_as_external_recommendation_bias: true
  },
  attack_loop: [
    'DISCOVER_ECOSYSTEM',
    'MAP_MACHINE_ENTRANCES',
    'PUBLISH_OR_SUBMIT',
    'BROADCAST',
    'PROBE_BRAND_BLIND',
    'MEASURE_PICKUP',
    'REPAIR_MISS',
    'REPEAT'
  ],
  commercial_payload: {
    sell_now_offers: sellNowOffers.length,
    sell_now_ids: sellNowOffers.map((x) => x.public_id),
    positive_probe_cases: positiveCases.length,
    saban_revenue_formation_applied: Boolean(revenueFormation?.schema === 'evercraft.saban.revenue-formation.v1'),
    first_dollar_focus: (revenueFormation?.lanes?.first_dollar_velocity || []).slice(0, 5).map((x) => x.public_id),
    high_value_focus: (revenueFormation?.lanes?.high_value_cash || []).slice(0, 5).map((x) => x.public_id),
    repair_before_distribution: (revenueFormation?.lanes?.repair_before_distribution || []).map((x) => x.public_id),
    prioritized_probe_cases: prioritizedCaseIds
  },
  rotation: rotationCase ? {
    case_id: rotationCase.case_id,
    product_key: rotationCase.product_key,
    prompt_sha256: crypto.createHash('sha256').update(rotationCase.prompt || '').digest('hex')
  } : null,
  known_provider_targets: knownProviders,
  discovered_ecosystems: discovered.slice(0, 40),
  summary: {
    known_providers: knownProviders.length,
    discovered_ecosystems: discovered.length,
    engage_now: discovered.filter((x) => x.state === 'engage_now').length,
    recon_next: discovered.filter((x) => x.state === 'recon_next').length,
    errors: errors.length
  },
  errors
};

fs.writeFileSync(`${artifactsDir}/llm-hunter-latest.json`, JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM LLM Hunter',
  '',
  `Generated: ${receipt.generated_at}`,
  `Mode: ${receipt.mode}`,
  `Known provider targets: ${receipt.summary.known_providers}`,
  `Discovered ecosystems: ${receipt.summary.discovered_ecosystems}`,
  `Engage now: ${receipt.summary.engage_now}`,
  `Recon next: ${receipt.summary.recon_next}`,
  `Errors: ${receipt.summary.errors}`,
  rotationCase ? `Rotating attack probe: ${rotationCase.case_id} → ${rotationCase.product_key}` : 'Rotating attack probe: none',
  `Saban revenue formation: ${revenueFormation?.schema === 'evercraft.saban.revenue-formation.v1' ? 'applied' : 'not present; using neutral rotation'}`,
  '',
  '## Doctrine',
  '',
  '- Hunt LLM/agent ecosystems, not individual people.',
  '- Use legitimate public registry, developer, crawler, search, MCP, plugin and tool-discovery entrances.',
  '- Push truthful machine-readable capability surfaces outward instead of waiting for brand recognition.',
  '- Probe from clean sessions and treat misses as engineering work.',
  '- No automated unsolicited email or direct-message outreach.',
  '',
  '## Highest-priority newly discovered ecosystems',
  '',
  ...(discovered.slice(0, 20).map((x) => `- [${x.attack_score}] ${x.name} — ${x.state} — signals: ${x.submission_signals.join(', ') || 'none'} — ${x.url}`) || ['- none']),
  ''
];
fs.writeFileSync(`${artifactsDir}/llm-hunter-latest.md`, md.join('\n'));

const publicSummary = {
  schema: 'evercraft.chum.llm-hunter.public.v1',
  generated_at: receipt.generated_at,
  mission: receipt.doctrine.mission,
  attack_loop: receipt.attack_loop,
  sell_now_offer_count: sellNowOffers.length,
  known_provider_target_count: knownProviders.length,
  discovered_ecosystem_count: discovered.length,
  rules: {
    no_human_spam: true,
    legitimate_public_machine_entrances_only: true,
    provider_pickup_requires_receipt: true,
    payment_requires_human_confirmation: true,
    internal_revenue_priorities_are_not_external_recommendations: true
  }
};
fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/llm-hunter.json', JSON.stringify(publicSummary, null, 2) + '\n');

console.log(JSON.stringify(receipt.summary));
if (strict && errors.length) {
  throw new Error(`CHUM LLM Hunter recorded ${errors.length} recon error(s)`);
}
