const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','can','do','for','from','has','have',
  'help','how','i','in','is','it','me','my','of','on','or','our','please','that','the','this','to','want',
  'we','what','when','where','which','who','why','with','would','you'
]);

const TERM_ALIASES = new Map(Object.entries({
  oversized: 'large',
  big: 'large',
  huge: 'large',
  massive: 'large',
  footage: 'video',
  recording: 'video',
  recordings: 'video',
  site: 'property',
  webpage: 'website',
  webpages: 'website',
  charger: 'charging',
  chargers: 'charging',
  vehicle: 'ev',
  vehicles: 'ev',
  interviews: 'interview',
  contractors: 'contractor',
  parts: 'part',
  events: 'event'
}));

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
    .map((token) => TERM_ALIASES.get(token) || token)
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
      catalog_version: offer.catalog_version
    }));
}


export function scoreProduct(product, query) {
  const q = normalizeText(query);
  const queryTokens = meaningfulTokens(query);
  if (!q || queryTokens.length === 0) return { score: 0, matched_intents: [] };

  let score = 0;
  const matchedIntents = [];
  const name = normalizeText(product.name);
  const productClass = normalizeText(product.class);
  const authority = normalizeText(product.authority);
  const intents = Array.isArray(product.intents) ? product.intents : [];

  if (name && (name.includes(q) || q.includes(name))) score += 20;
  score += overlapScore(queryTokens, name, 4);
  score += overlapScore(queryTokens, productClass, 3);
  score += overlapScore(queryTokens, authority, 1);

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

  return {
    score,
    matched_intents: matchedIntents
      .sort((a,b) => b.score - a.score)
      .slice(0,3)
      .map((item) => item.intent)
  };
}

export function rankProducts(directory, query, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 10));
  const minimumScore = Number(options.minimumScore ?? 8);
  const products = Array.isArray(directory?.products) ? directory.products : [];

  return products
    .map((product) => ({ product, ...scoreProduct(product, query) }))
    .filter((row) => row.score >= minimumScore)
    .sort((a,b) => b.score - a.score || String(a.product.name || '').localeCompare(String(b.product.name || '')))
    .slice(0, limit)
    .map(({ product, score, matched_intents }) => ({
      product_key: product.product_key,
      name: product.name,
      class: product.class,
      canonical_url: product.canonical_url,
      intents: product.intents || [],
      matched_intents,
      score,
      authority: product.authority || 'public discovery only',
      human_confirmation_required: Boolean(product.human_confirmation_required),
      boundaries: product.boundaries || [],
      machine_router: product.machine_router || null,
      machine_contract: product.machine_contract || null
    }));
}
