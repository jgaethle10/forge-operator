import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const registry = readJson('conformance/products.json');
const timeoutMs = 15000;
const strict = process.argv.includes('--strict');
const mirrorBaseRaw = process.env.CHUM_PUBLIC_MIRROR_BASE ||
  'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products';
const mirrorBase = mirrorBaseRaw.endsWith('/') ? mirrorBaseRaw.slice(0, -1) : mirrorBaseRaw;

const crawlerProfiles = [
  {
    provider: 'chatgpt_search',
    robots_token: 'OAI-SearchBot',
    user_agent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)',
    lane: 'search'
  },
  {
    provider: 'chatgpt_user_fetch',
    robots_token: 'ChatGPT-User',
    user_agent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    lane: 'user_fetch'
  },
  {
    provider: 'openai_model_crawl',
    robots_token: 'GPTBot',
    user_agent: 'Mozilla/5.0 (compatible; GPTBot/1.4; +https://openai.com/gptbot)',
    lane: 'model_crawl'
  },
  {
    provider: 'claude_search',
    robots_token: 'Claude-SearchBot',
    user_agent: 'Claude-SearchBot',
    lane: 'search'
  },
  {
    provider: 'claude_user_fetch',
    robots_token: 'Claude-User',
    user_agent: 'Claude-User',
    lane: 'user_fetch'
  },
  {
    provider: 'claude_model_crawl',
    robots_token: 'ClaudeBot',
    user_agent: 'ClaudeBot',
    lane: 'model_crawl'
  },
  {
    provider: 'google_search',
    robots_token: 'Googlebot',
    user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    lane: 'search'
  },
  {
    provider: 'gemini_grounding',
    robots_token: 'Google-Extended',
    user_agent: null,
    lane: 'robots_policy_only'
  },
  {
    provider: 'copilot_search',
    robots_token: 'bingbot',
    user_agent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    lane: 'search'
  },
  {
    provider: 'perplexity_search',
    robots_token: 'PerplexityBot',
    user_agent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    lane: 'search'
  },
  {
    provider: 'apple_search_and_ai_context',
    robots_token: 'Applebot',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    lane: 'search'
  },
  {
    provider: 'apple_foundation_model_policy',
    robots_token: 'Applebot-Extended',
    user_agent: null,
    lane: 'robots_policy_only'
  },
  {
    provider: 'google_vertex_agent_crawl',
    robots_token: 'Google-CloudVertexBot',
    user_agent: 'Google-CloudVertexBot',
    lane: 'agent_crawl'
  },
  {
    provider: 'google_agent_user_fetch',
    robots_token: 'Google-Agent',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/140.0.0.0 Safari/537.36',
    lane: 'user_fetch'
  },
  {
    provider: 'gemini_notebook_user_fetch',
    robots_token: 'Google-GeminiNotebook',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 (compatible; Google-GeminiNotebook; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-gemininotebook)',
    lane: 'user_fetch'
  }
];

async function fetchText(url, userAgent = 'Evercraft-CHUM-CrawlerAudit/0.4') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': userAgent,
        accept: 'text/plain, text/html, application/json;q=0.9, */*;q=0.5'
      },
      signal: controller.signal
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get('content-type') || '',
      bytes: Buffer.byteLength(body),
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      final_url: url,
      content_type: '',
      bytes: 0,
      body: '',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  let seenDirective = false;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || seenDirective) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenDirective = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      current.rules.push({ type: field, path: value });
      seenDirective = true;
    }
  }

  return groups;
}

function robotsDecision(groups, token, pathName = '/') {
  const needle = String(token || '').toLowerCase();
  const matches = groups
    .map((group) => {
      const lengths = group.agents
        .map((agent) => agent === '*' ? 1 : (needle.includes(agent) || agent.includes(needle) ? agent.length : 0));
      return { group, match: Math.max(0, ...lengths) };
    })
    .filter((entry) => entry.match > 0);

  if (!matches.length) return { allowed: true, reason: 'no_matching_group' };
  const best = Math.max(...matches.map((entry) => entry.match));
  const rules = matches.filter((entry) => entry.match === best).flatMap((entry) => entry.group.rules);
  const matchingRules = rules
    .filter((rule) => {
      if (rule.type === 'disallow' && rule.path === '') return false;
      return pathName.startsWith(rule.path || '/');
    })
    .sort((a, b) => {
      const delta = (b.path || '').length - (a.path || '').length;
      if (delta) return delta;
      if (a.type === b.type) return 0;
      return a.type === 'allow' ? -1 : 1;
    });

  if (!matchingRules.length) return { allowed: true, reason: 'no_matching_rule' };
  const winning = matchingRules[0];
  return {
    allowed: winning.type === 'allow',
    reason: `${winning.type}:${winning.path || '/'}`
  };
}

async function inspectProduct(product) {
  const canonical = new URL(product.canonical_url);
  const robotsUrl = `${canonical.origin}/robots.txt`;
  const mirrorUrl = `${mirrorBase}/${product.product_key}/llms.txt`;
  const robots = await fetchText(robotsUrl);
  const robotsMissing = robots.status === 404;
  const groups = robots.ok ? parseRobots(robots.body) : [];

  const crawlers = await Promise.all(crawlerProfiles.map(async (profile) => {
    const policy = robotsMissing
      ? { allowed: true, reason: 'robots_404_assumed_allow' }
      : robots.ok
        ? robotsDecision(groups, profile.robots_token, canonical.pathname || '/')
        : { allowed: null, reason: `robots_unreadable_http_${robots.status || 'error'}` };

    let live = { checked: false, ok: null, status: null, reason: 'robots_policy_only' };
    let mirror = { checked: false, ok: null, status: null, reason: 'not_needed' };
    if (profile.user_agent) {
      const result = await fetchText(product.canonical_url, profile.user_agent);
      live = {
        checked: true,
        ok: result.ok,
        status: result.status,
        final_url: result.final_url,
        content_type: result.content_type,
        bytes: result.bytes,
        reason: result.ok ? 'reachable' : (result.error || `http_${result.status}`)
      };

      if (!result.ok) {
        const fallback = await fetchText(mirrorUrl, profile.user_agent);
        mirror = {
          checked: true,
          ok: fallback.ok,
          status: fallback.status,
          final_url: fallback.final_url,
          content_type: fallback.content_type,
          bytes: fallback.bytes,
          reason: fallback.ok ? 'reachable_public_mirror' : (fallback.error || `http_${fallback.status}`)
        };
      }
    }

    return {
      ...profile,
      robots_allowed: policy.allowed,
      robots_reason: policy.reason,
      live,
      mirror,
      effective_reachable: live.ok === true || mirror.ok === true,
      used_public_mirror: live.ok === false && mirror.ok === true
    };
  }));

  const searchProfiles = crawlers.filter((c) => ['search','user_fetch','agent_crawl'].includes(c.lane));
  const blocked = searchProfiles.filter((c) => c.robots_allowed === false || (c.live.checked && c.effective_reachable === false));
  const fallback = searchProfiles.filter((c) => c.used_public_mirror);

  return {
    product_key: product.product_key,
    name: product.name,
    canonical_url: product.canonical_url,
    public_mirror_url: mirrorUrl,
    robots: {
      url: robotsUrl,
      status: robots.status,
      readable: robots.ok,
      missing_assumed_allow: robotsMissing,
      bytes: robots.bytes,
      error: robots.error || null
    },
    search_discovery_state: blocked.length ? 'repair_needed' : (fallback.length ? 'public_mirror_reachable' : 'open_or_reachable'),
    blocked_search_lanes: blocked.map((c) => c.provider),
    fallback_search_lanes: fallback.map((c) => c.provider),
    crawlers
  };
}

const products = [];
const PRODUCT_CONCURRENCY = 3;
const sourceProducts = registry.products || [];
for (let i = 0; i < sourceProducts.length; i += PRODUCT_CONCURRENCY) {
  products.push(...await Promise.all(sourceProducts.slice(i, i + PRODUCT_CONCURRENCY).map(inspectProduct)));
}

const blockedRows = products.flatMap((product) =>
  product.crawlers
    .filter((crawler) => ['search','user_fetch','agent_crawl'].includes(crawler.lane) &&
      (crawler.robots_allowed === false || (crawler.live.checked && crawler.effective_reachable === false)))
    .map((crawler) => ({
      product_key: product.product_key,
      provider: crawler.provider,
      robots_allowed: crawler.robots_allowed,
      http_status: crawler.live.ok ? crawler.live.status : (crawler.mirror?.status ?? crawler.live.status),
      reason: crawler.robots_allowed === false ? crawler.robots_reason : (crawler.mirror?.reason || crawler.live.reason)
    }))
);

const receipt = {
  schema: 'evercraft.chum.crawler-audit.v2',
  generated_at: new Date().toISOString(),
  doctrine: {
    public_commercial_surfaces_should_be_discoverable: true,
    private_admin_surfaces_should_not_be_advertised: true,
    provider_pickup_not_inferred_from_access: true
  },
  profiles: crawlerProfiles.map(({ user_agent, ...rest }) => ({ ...rest, http_probe: Boolean(user_agent) })),
  summary: {
    products: products.length,
    crawler_profiles: crawlerProfiles.length,
    blocked_search_lanes: blockedRows.length,
    products_needing_repair: new Set(blockedRows.map((row) => row.product_key)).size,
    products_using_public_mirror: products.filter((product) => product.fallback_search_lanes.length).length,
    fallback_search_lanes: products.reduce((count, product) => count + product.fallback_search_lanes.length, 0)
  },
  blocked_search_lanes: blockedRows,
  products
};

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/crawler-audit-latest.json', JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Crawler / AI Discovery Audit',
  '',
  `Generated: ${receipt.generated_at}`,
  `Products: ${receipt.summary.products}`,
  `Crawler profiles: ${receipt.summary.crawler_profiles}`,
  `Blocked search lanes: ${receipt.summary.blocked_search_lanes}`,
  `Products needing repair: ${receipt.summary.products_needing_repair}`,
  `Products using CHUM public mirror: ${receipt.summary.products_using_public_mirror}`,
  `Fallback search lanes: ${receipt.summary.fallback_search_lanes}`,
  '',
  '> Reachability and robots permission make a surface eligible to be crawled. They do not prove indexing, recommendation, citation, or conversion.',
  '',
  '| Product | Search state | Robots | Fallback lanes | Blocked lanes |',
  '|---|---|---:|---|---|',
  ...products.map((product) =>
    `| ${product.name} | ${product.search_discovery_state} | ${product.robots.status || 'ERR'} | ${product.fallback_search_lanes.join(', ') || 'none'} | ${product.blocked_search_lanes.join(', ') || 'none'} |`
  ),
  '',
  '## Repair queue',
  '',
  ...(blockedRows.length
    ? blockedRows.map((row) => `- ${row.product_key} / ${row.provider}: ${row.reason} (HTTP ${row.http_status ?? 'n/a'})`)
    : ['- No blocked search lanes detected by this run.']),
  ''
];

fs.writeFileSync('artifacts/chum/crawler-audit-latest.md', md.join('\n'));
console.log(JSON.stringify(receipt.summary));

if (strict && blockedRows.length) {
  throw new Error(`CHUM crawler audit found ${blockedRows.length} blocked search lane(s)`);
}
