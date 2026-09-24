import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const hasFlag = (flag) => process.argv.includes(flag);
const offline = hasFlag('--offline');
const strict = hasFlag('--strict');
const timeoutMs = 12000;

const conformance = readJson('conformance/products.json');
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');
const offerCatalog = readJson('public/.well-known/evercraft-offers.json');

const readJsonDir = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      try {
        return readJson(`${dir}/${name}`);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const registryPublicationReceipts = readJsonDir('conformance/registry-publications');
const providerObservationReceipts = readJsonDir('conformance/provider-observations');

const conformanceByKey = new Map((conformance.products || []).map((p) => [p.product_key, p]));
const publicByKey = new Map((directory.products || []).map((p) => [p.product_key, p]));
const catalogByKey = new Map(
  (catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p])
);
const offersByKey = new Map((offerCatalog.offers || []).map((p) => [p.product_key, p]));
const portfolioKeys = Array.from(new Set([
  ...conformanceByKey.keys(),
  ...publicByKey.keys(),
  ...catalogByKey.keys(),
  ...offersByKey.keys()
])).sort();

const liveProviderProbe = fs.existsSync('artifacts/chum/provider-probe-latest.json')
  ? readJson('artifacts/chum/provider-probe-latest.json')
  : null;
const liveProviderObservationsByKey = new Map();
for (const result of liveProviderProbe?.results || []) {
  const key = result.product_key;
  if (!key) continue;
  const list = liveProviderObservationsByKey.get(key) || [];
  list.push(result);
  liveProviderObservationsByKey.set(key, list);
}
const registryReceiptsByKey = new Map();
for (const receipt of registryPublicationReceipts) {
  const key = receipt.product_key;
  if (!key) continue;
  const list = registryReceiptsByKey.get(key) || [];
  list.push(receipt);
  registryReceiptsByKey.set(key, list);
}
const providerObservationsByKey = new Map();
for (const receipt of providerObservationReceipts) {
  const key = receipt.product_key;
  if (!key) continue;
  const list = providerObservationsByKey.get(key) || [];
  list.push(receipt);
  providerObservationsByKey.set(key, list);
}

const providerTargets = (conformance.baseline_providers || []).map((provider) => ({
  provider,
  behavior_state: 'not_run',
  signaling_state: 'public_surfaces_available',
  note: 'CHUM does not claim provider discovery, recommendation, invocation, or conversion without a receipt-backed probe.'
}));

async function probe(url, kind) {
  if (!url) return { declared: false, checked: false, valid: false, status: null, reason: 'not_declared' };
  if (offline) return { declared: true, checked: false, valid: null, status: null, reason: 'offline' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Evercraft-CHUM/0.2 (+public-discovery-canary)',
        accept: 'text/plain, application/json;q=0.9, text/html;q=0.7, */*;q=0.3'
      },
      signal: controller.signal
    });
    const body = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const reasons = [];

    if (!response.ok) reasons.push(`http_${response.status}`);
    if (kind === 'llms') {
      if (/^\s*<!doctype html|^\s*<html/i.test(body)) reasons.push('html_instead_of_text');
      if (!/text\/plain/i.test(contentType)) reasons.push('unexpected_content_type');
    }
    if (['discovery', 'conformance', 'openapi'].includes(kind) && response.ok) {
      try { JSON.parse(body); } catch { reasons.push('invalid_json'); }
    }

    return {
      declared: true,
      checked: true,
      valid: reasons.length === 0,
      status: response.status,
      content_type: contentType,
      bytes: Buffer.byteLength(body),
      reason: reasons.join(',') || 'ok'
    };
  } catch (error) {
    return {
      declared: true,
      checked: true,
      valid: false,
      status: 0,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function readiness({ product, publicEntry, catalogEntry, checks }) {
  const gates = [
    ['public_directory', Boolean(publicEntry)],
    ['canonical_surface', checks.canonical?.valid === true],
    ['llms_surface', checks.llms?.valid === true],
    ['machine_contract', Boolean(
      checks.discovery?.valid === true ||
      checks.conformance?.valid === true ||
      checks.openapi?.valid === true
    )],
    ['agent_invocation_declared', Boolean(catalogEntry?.mcp)]
  ];
  const passed = gates.filter(([, ok]) => ok).length;
  return {
    surface_readiness_percent: Math.round((passed / gates.length) * 100),
    gates: Object.fromEntries(gates),
    provider_behavior_state: product.provider_behavior_state || 'not_run'
  };
}

async function inspectProduct(product) {
  const publicEntry = publicByKey.get(product.product_key);
  const catalogEntry = catalogByKey.get(product.product_key);
  const commercialEntry = offersByKey.get(product.product_key);
  const registryReceipts = registryReceiptsByKey.get(product.product_key) || [];
  const providerObservations = [
    ...(providerObservationsByKey.get(product.product_key) || []),
    ...(liveProviderObservationsByKey.get(product.product_key) || [])
  ];

  const entries = [
    ['canonical', product.canonical_url],
    ['llms', product.llms_url],
    ['conformance', product.conformance_url],
    ['discovery', product.discovery_url],
    ['openapi', product.openapi_url]
  ];

  const pairs = await Promise.all(entries.map(async ([kind, url]) => [kind, await probe(url, kind)]));
  const checks = Object.fromEntries(pairs);

  return {
    product_key: product.product_key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    intents: publicEntry?.intents || [],
    mcp: catalogEntry?.mcp || null,
    commercial: commercialEntry ? {
      state: commercialEntry.commercial_state,
      machine_state: commercialEntry.machine_state,
      pricing: commercialEntry.pricing || null,
      offers: commercialEntry.offers || [],
      public_url: commercialEntry.public_url || null,
      confirmation: commercialEntry.confirmation || null,
      caution: commercialEntry.caution || null
    } : { state:'not_in_current_sell_now_catalog', machine_state:null, pricing:null, offers:[] },
    checks,
    readiness: readiness({ product, publicEntry, catalogEntry, checks }),
    distribution_state: {
      official_registry: registryReceipts.some((r) => r.evidence_state === 'receipt_backed' && r.run_conclusion === 'success')
        ? 'published_receipt_backed'
        : 'not_receipt_backed',
      public_web_discovery: product.public_web_discovery_state || 'not_measured',
      provider_observations: providerObservations.length,
      provider_surface_state: providerObservations.some((r) => r.evaluation?.pickup_observed || r.evaluation?.expected_product_mentioned || r.evaluation?.expected_host_cited)
        ? 'positive_observation_recorded'
        : providerObservations.some((r) => r.status === 'completed' || r.surfaced_forensiscope === false)
          ? 'negative_observation_recorded'
          : providerObservations.length
            ? 'observation_recorded'
            : 'not_measured'
    },
    registry_publication_receipts: registryReceipts,
    provider_observation_receipts: providerObservations,
    signal_plan: [
      {
        lane: 'crawl',
        state: checks.canonical?.valid === true && checks.llms?.valid === true ? 'ready' : 'repair_needed',
        action: 'Keep canonical pages, llms.txt and structured discovery surfaces public, accurate and fresh.'
      },
      {
        lane: 'agent_registry',
        state: catalogEntry?.mcp ? 'declared' : 'not_declared',
        action: catalogEntry?.mcp
          ? 'Maintain the specialist MCP entry and route compatible natural-language intent to it.'
          : 'Evaluate whether this capability should expose a bounded MCP or HTTP invocation surface.'
      },
      {
        lane: 'provider_probe',
        state: 'not_run',
        action: 'Run provider-specific buyer-intent probes only through authorized interfaces and store receipts before claiming pickup.'
      },
      {
        lane: 'conversion',
        state: 'human_gate_preserved',
        action: 'Attribute AI-originated handoffs and preserve explicit human confirmation for checkout or payment obligations.'
      }
    ]
  };
}

function mergedProduct(productKey) {
  const c = conformanceByKey.get(productKey) || {};
  const p = publicByKey.get(productKey) || {};
  const r = catalogByKey.get(productKey) || {};
  return {
    product_key: productKey,
    name: c.name || p.name || r.name || productKey,
    class: c.class || p.class || r.class || 'registry_product',
    canonical_url: c.canonical_url || p.canonical_url || r.canonical_url || null,
    llms_url: c.llms_url || r.llms_url || null,
    conformance_url: c.conformance_url || null,
    discovery_url: c.discovery_url || null,
    openapi_url: c.openapi_url || null,
    public_web_discovery_state: c.public_web_discovery_state || 'not_measured',
    provider_behavior_state: c.provider_behavior_state || 'not_run'
  };
}

const products = [];
for (const productKey of portfolioKeys) {
  products.push(await inspectProduct(mergedProduct(productKey)));
}

const allChecks = products.flatMap((p) =>
  Object.entries(p.checks)
    .filter(([, v]) => v.declared)
    .map(([kind, v]) => ({ product_key: p.product_key, kind, ...v }))
);
const checked = allChecks.filter((x) => x.checked);
const valid = checked.filter((x) => x.valid === true);
const invalid = checked.filter((x) => x.valid === false);
const sellNow = [...offersByKey.values()];
const paymentReady = sellNow.filter((x) => String(x.machine_state || '').startsWith('payment_ready'));
const quoteReady = sellNow.filter((x) => String(x.machine_state || '') === 'quote_ready');

const receipt = {
  schema: 'evercraft.chum.receipt.v2',
  name: 'CHUM',
  expansion: 'Capability Handoff & Utility Mesh',
  generated_at: new Date().toISOString(),
  mode: offline ? 'offline' : 'live_surface_probe',
  doctrine: {
    goal: 'Make legitimate public capabilities easy for AI systems and agents to discover, understand, route to, invoke where authorized, and hand off to human-confirmed commerce.',
    no_spam: true,
    no_private_topology_exposure: true,
    no_unverified_provider_claims: true,
    human_confirmation_for_payment_obligations: true
  },
  summary: {
    products: products.length,
    declared_surfaces: allChecks.length,
    checked_surfaces: checked.length,
    valid_surfaces: valid.length,
    invalid_surfaces: invalid.length,
    sell_now_offers: sellNow.length,
    payment_ready_offers: paymentReady.length,
    quote_ready_offers: quoteReady.length
  },
  provider_targets: providerTargets,
  products
};

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/chum-latest.json', JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Signal Mesh Receipt',
  '',
  `Generated: ${receipt.generated_at}`,
  `Mode: ${receipt.mode}`,
  `Products: ${receipt.summary.products}`,
  `Declared public surfaces: ${receipt.summary.declared_surfaces}`,
  `Checked surfaces: ${receipt.summary.checked_surfaces}`,
  `Valid surfaces: ${receipt.summary.valid_surfaces}`,
  `Invalid surfaces: ${receipt.summary.invalid_surfaces}`,
  '',
  '> Readiness below measures Evercraft-owned public surfaces. It is not evidence that any named AI provider discovered, recommended, invoked, or converted a product.',
  '',
  '| Product | Surface readiness | Canonical | llms.txt | Contract | MCP declared | Official registry | Web discovery | Provider observations |',
  '|---|---:|---|---|---|---|---|---|---|',
  ...products.map((p) => {
    const g = p.readiness.gates;
    return `| ${p.name} | ${p.readiness.surface_readiness_percent}% | ${g.canonical_surface ? 'yes' : 'no'} | ${g.llms_surface ? 'yes' : 'no'} | ${g.machine_contract ? 'yes' : 'no'} | ${g.agent_invocation_declared ? 'yes' : 'no'} | ${p.distribution_state.official_registry} | ${p.distribution_state.public_web_discovery} | ${p.distribution_state.provider_observations} |`;
  }),
  '',
  '## Repair queue',
  '',
  ...(invalid.length
    ? invalid.map((x) => `- ${x.product_key} / ${x.kind}: ${x.reason || x.status}`)
    : ['- No invalid checked surfaces detected.']),
  ''
];

fs.writeFileSync('artifacts/chum/chum-latest.md', md.join('\n'));

console.log(JSON.stringify(receipt.summary));
console.log('CHUM receipt: artifacts/chum/chum-latest.json');

if (strict && invalid.length) {
  throw new Error(`CHUM found ${invalid.length} invalid declared public surface(s)`);
}
