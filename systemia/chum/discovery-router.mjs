const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','can','do','for','from','has','have',
  'help','how','i','in','is','it','me','my','of','on','or','that','the','this','to','want',
  'what','when','where','which','who','why','with','would','you'
]);

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function meaningfulTokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function overlapScore(queryTokens, text, weight) {
  const tokens = new Set(meaningfulTokens(text));
  let matched = 0;
  for (const token of queryTokens) {
    if (tokens.has(token)) matched += 1;
  }
  return matched * weight;
}

export function scoreOffer(offer, query) {
  const q = normalizeText(query);
  const queryTokens = meaningfulTokens(query);
  if (!q || queryTokens.length === 0) return { score: 0, matched_intents: [] };

  let score = 0;
  const matchedIntents = [];
  const name = normalizeText(offer.name);
  const problem = normalizeText(offer.problem);
  const intents = Array.isArray(offer.intent_terms) ? offer.intent_terms : [];

  if (name && (name.includes(q) || q.includes(name))) score += 20;
  score += overlapScore(queryTokens, name, 4);
  score += overlapScore(queryTokens, problem, 2);

  for (const rawIntent of intents) {
    const intent = normalizeText(rawIntent);
    let intentScore = overlapScore(queryTokens, intent, 5);
    if (intent && (intent.includes(q) || q.includes(intent))) intentScore += 20;

    const intentTokens = meaningfulTokens(intent);
    const querySet = new Set(queryTokens);
    const matched = intentTokens.filter((token) => querySet.has(token));
    const coverage = intentTokens.length ? matched.length / intentTokens.length : 0;
    if (coverage >= 0.6 && matched.length >= 2) intentScore += 12;
    if (coverage >= 0.8 && matched.length >= 2) intentScore += 10;

    if (intentScore > 0) {
      score += intentScore;
      matchedIntents.push({ intent: rawIntent, score: intentScore });
    }
  }

  if (score > 0 && offer.commercial_state === 'sell_now') score += 3;
  if (score > 0 && /payment_ready|human_handoff_ready/.test(String(offer.machine_state || ''))) score += 1;

  return {
    score,
    matched_intents: matchedIntents
      .sort((a,b) => b.score - a.score)
      .slice(0,3)
      .map((item) => item.intent)
  };
}

export function rankOffers(catalog, query, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 10));
  const minimumScore = Number(options.minimumScore ?? 8);
  const offers = Array.isArray(catalog?.offers) ? catalog.offers : [];

  return offers
    .map((offer) => ({ offer, ...scoreOffer(offer, query) }))
    .filter((row) => row.score >= minimumScore)
    .sort((a,b) =>
      b.score - a.score ||
      Number(b.offer.commercial_state === 'sell_now') - Number(a.offer.commercial_state === 'sell_now') ||
      String(a.offer.name || '').localeCompare(String(b.offer.name || ''))
    )
    .slice(0, limit)
    .map(({ offer, score, matched_intents }) => ({
      public_id: offer.public_id,
      product_key: offer.product_key || null,
      source: offer.source || 'machine_catalog',
      name: offer.name,
      problem: offer.problem,
      intent_terms: offer.intent_terms || [],
      matched_intents,
      score,
      commercial_state: offer.commercial_state,
      machine_state: offer.machine_state,
      pricing: offer.pricing,
      offers: offer.offers || [],
      human_ui_required: Boolean(offer.human_ui_required),
      confirmation: offer.confirmation,
      public_url: offer.public_url,
      payment_authority: offer.payment_authority,
      invocation_status: offer.invocation_status,
      authority: offer.authority || null,
      boundaries: Array.isArray(offer.boundaries) ? offer.boundaries : [],
      catalog_version: offer.catalog_version
    }));
}

function productAsDiscoveryOffer(product) {
  return {
    public_id: `product:${product.product_key}`,
    product_key: product.product_key,
    source: 'public_directory',
    name: product.name,
    problem: Array.isArray(product.intents) ? product.intents.join('; ') : '',
    intent_terms: Array.isArray(product.intents) ? product.intents : [],
    commercial_state: 'discovery_only',
    machine_state: 'discovery_only',
    pricing: '',
    offers: [],
    human_ui_required: Boolean(product.human_confirmation_required),
    confirmation: product.human_confirmation_required
      ? 'Any irreversible financial or authority action requires explicit human confirmation.'
      : 'No payment or authority action is created by discovery.',
    public_url: product.canonical_url,
    payment_authority: 'none_via_discovery',
    invocation_status: 'Public capability discovery only unless a separately verified invocation surface is declared.',
    authority: product.authority || 'Public discovery only.',
    boundaries: Array.isArray(product.boundaries) ? product.boundaries : [],
    catalog_version: 'public-directory-v1'
  };
}

export function rankDiscoveryCandidates(machineCatalog, productDirectory, query, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 10));
  const minimumScore = Number(options.minimumScore ?? 8);
  const expandedLimit = Math.max(limit * 4, 20);

  const commercial = rankOffers(machineCatalog, query, { limit: expandedLimit, minimumScore })
    .map((row) => ({ ...row, source: row.source || 'machine_catalog' }));

  const directoryCatalog = {
    offers: (Array.isArray(productDirectory?.products) ? productDirectory.products : [])
      .map(productAsDiscoveryOffer)
  };
  const directory = rankOffers(directoryCatalog, query, { limit: expandedLimit, minimumScore })
    .map((row) => ({
      ...row,
      raw_score: row.score,
      score: Math.max(1, Math.round(row.score * 0.4))
    }))
    .filter((row) => row.score >= minimumScore);

  const combined = [...commercial, ...directory]
    .sort((a,b) =>
      b.score - a.score ||
      Number(a.source !== 'machine_catalog') - Number(b.source !== 'machine_catalog') ||
      String(a.name || '').localeCompare(String(b.name || ''))
    );

  const seen = new Set();
  const result = [];
  for (const row of combined) {
    const identity = row.product_key
      ? `product:${row.product_key}`
      : `offer:${row.public_id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}
