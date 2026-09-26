import { normalizeText, tokenize as meaningfulTokens, intentSignature, compareIntent } from './intent-language.mjs';

function overlapScore(querySig, text, weight) {
  const cmp = compareIntent(querySig, text);
  return cmp.token_overlap * weight + cmp.concept_overlap * Math.max(3, weight);
}

export { normalizeText, meaningfulTokens };

export function scoreOffer(offer, query) {
  const q = normalizeText(query);
  const querySig = intentSignature(query);
  if (!q || querySig.tokens.length === 0) {
    return { score: 0, matched_intents: [], matched_concepts: [], support: 0 };
  }

  let score = 0;
  const matchedIntents = [];
  const matchedConcepts = new Set();
  let support = 0;
  const name = normalizeText(offer.name);
  const problem = normalizeText(offer.problem);
  const intents = Array.isArray(offer.intent_terms) ? offer.intent_terms : [];

  if (name && (name.includes(q) || q.includes(name))) {
    score += 20;
    support += 1;
  }
  score += overlapScore(querySig, name, 4);

  const problemCmp = compareIntent(querySig, problem);
  score += problemCmp.score * 0.7;
  if (problemCmp.token_overlap > 0 || problemCmp.concept_overlap > 0) support += 1;
  for (const concept of problemCmp.matched_concepts) matchedConcepts.add(concept);

  for (const rawIntent of intents) {
    const intent = normalizeText(rawIntent);
    const cmp = compareIntent(querySig, intent);
    let intentScore = cmp.score;
    if (intent && (intent.includes(q) || q.includes(intent))) intentScore += 20;

    const intentTokens = meaningfulTokens(intent);
    const matched = intentTokens.filter((token) => querySig.token_set.has(token));
    const coverage = intentTokens.length ? matched.length / intentTokens.length : 0;
    if (coverage >= 0.6 && matched.length >= 2) intentScore += 12;
    if (coverage >= 0.8 && matched.length >= 2) intentScore += 10;

    if (intentScore > 0) {
      score += intentScore;
      support += 1;
      for (const concept of cmp.matched_concepts) matchedConcepts.add(concept);
      matchedIntents.push({ intent: rawIntent, score: intentScore });
    }
  }

  if (score > 0 && offer.commercial_state === 'sell_now') score += 3;
  if (score > 0 && /payment_ready|human_handoff_ready|callable|live|routable/.test(String(offer.machine_state || ''))) {
    score += 1;
  }

  return {
    score: Number(score.toFixed(3)),
    matched_intents: matchedIntents
      .sort((a,b) => b.score - a.score)
      .slice(0,3)
      .map((item) => item.intent),
    matched_concepts: [...matchedConcepts],
    support
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
      b.support - a.support ||
      Number(b.offer.commercial_state === 'sell_now') - Number(a.offer.commercial_state === 'sell_now') ||
      String(a.offer.name || '').localeCompare(String(b.offer.name || ''))
    )
    .slice(0, limit)
    .map(({ offer, score, matched_intents, matched_concepts, support }) => ({
      public_id: offer.public_id,
      product_key: offer.product_key || null,
      source: offer.source || 'machine_catalog',
      name: offer.name,
      problem: offer.problem,
      intent_terms: offer.intent_terms || [],
      matched_intents,
      matched_concepts,
      support,
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
      b.support - a.support ||
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
