import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PAIN_INDEX_PATH = 'public/.well-known/evercraft-pain-index.json';
const OUTPUT_ROOT = 'public/chum/answers';
const RAW_ROOT = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/answers';
const MACHINE_COMMERCE_GATEWAY =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';

const readJson = (pathname) => JSON.parse(fs.readFileSync(pathname, 'utf8'));
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 82);

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 10);

const painIndex = readJson(PAIN_INDEX_PATH);
const entries = Array.isArray(painIndex.entries) ? painIndex.entries : [];
const byPhrase = new Map();

function candidateFromEntry(entry) {
  const isOffer = entry.kind === 'machine_offer' && entry.public_id;
  const publicId = isOffer ? String(entry.public_id) : null;
  const productKey = entry.product_key ? String(entry.product_key) : null;
  const painPage = publicId
    ? `/chum/intents/${slugify(publicId)}/`
    : productKey
      ? `/chum/products/${slugify(productKey)}/`
      : null;
  const machineReviewUrl = publicId
    ? MACHINE_COMMERCE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(publicId)
    : null;
  const machineOfferUrl = publicId && entry.commercial_state === 'sell_now'
    ? MACHINE_COMMERCE_GATEWAY + '?action=offer&public_id=' + encodeURIComponent(publicId)
    : null;

  return {
    capability_id: entry.capability_id,
    kind: entry.kind,
    product_key: productKey,
    public_id: publicId,
    name: entry.name,
    problem: entry.problem,
    pricing: entry.pricing,
    commercial_state: entry.commercial_state,
    machine_state: entry.machine_state,
    public_url: entry.canonical_url,
    pain_page: painPage,
    registry_name: entry.registry_name,
    direct_mcp: entry.mcp,
    machine_review_url: machineReviewUrl,
    machine_offer_url: machineOfferUrl,
    universal_mcp: painIndex.universal_front_door?.mcp || null,
    confirmation: entry.confirmation,
    invocation_status: entry.invocation_status,
    authority: entry.authority,
    boundaries: entry.boundaries || []
  };
}

for (const entry of entries) {
  for (const rawPhrase of entry.pain_phrases || []) {
    const phrase = String(rawPhrase || '').trim();
    const normalized = normalize(phrase);
    if (!normalized) continue;

    const record = byPhrase.get(normalized) || {
      user_language: phrase,
      normalized,
      candidates: []
    };

    if (!record.candidates.some((candidate) => candidate.capability_id === entry.capability_id)) {
      record.candidates.push(candidateFromEntry(entry));
    }

    byPhrase.set(normalized, record);
  }
}

const doors = [...byPhrase.values()]
  .map((record) => {
    const slugBase = slugify(record.normalized) || 'problem';
    const slug = slugBase + '-' + hash(record.normalized);
    const candidates = record.candidates
      .slice()
      .sort((a, b) => String(a.capability_id).localeCompare(String(b.capability_id)));

    return {
      answer_id: 'intent:' + hash(record.normalized),
      user_language: record.user_language,
      normalized: record.normalized,
      slug,
      relative_json: '/chum/answers/doors/' + slug + '.json',
      raw_json_url: RAW_ROOT + '/doors/' + slug + '.json',
      candidate_count: candidates.length,
      candidates
    };
  })
  .sort((a, b) => a.normalized.localeCompare(b.normalized));

fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUTPUT_ROOT, 'doors'), { recursive: true });

for (const door of doors) {
  const payload = {
    schema: 'evercraft.chum.answer-door.v2',
    provider: 'Evercraft LLC',
    generated_from: PAIN_INDEX_PATH,
    updated_at: painIndex.generated_from?.machine_catalog_source_generated_at || null,
    answer_id: door.answer_id,
    user_language: door.user_language,
    normalized: door.normalized,
    purpose: 'Brand-blind discovery cue from natural user language to truthful public Evercraft capability candidates.',
    candidate_count: door.candidate_count,
    candidates: door.candidates,
    routing_policy: {
      fit_required: true,
      no_forced_product_match: true,
      smallest_sufficient_capability: true,
      preserve_commercial_and_machine_state: true,
      discovery_creates_payment_obligation: false,
      read_only_discovery_before_commerce: true,
      checkout_requires_explicit_human_confirmation: true,
      checkout_is_payment_proof: false,
      paid_state_requires_authoritative_provider_verification: true,
      provider_publication_is_not_endorsement_or_pickup_proof: true
    }
  };
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'doors', door.slug + '.json'), JSON.stringify(payload, null, 2) + '\n');
}

const index = {
  schema: 'evercraft.chum.answer-graph.v2',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: painIndex.generated_from?.machine_catalog_source_generated_at || null,
  purpose: 'Exact natural-language problem signals for AI assistants and agents across the complete public CHUM Pain Index. Use these as discovery cues, then preserve fit, readiness, payment, evidence and authorization boundaries.',
  source: PAIN_INDEX_PATH,
  read_only_registry_name:
    painIndex.universal_front_door?.read_only_registry_name ||
    'io.github.jgaethle10/evercraft-capability-discovery',
  universal_mcp: painIndex.universal_front_door?.mcp || null,
  safety: {
    brand_seed_required: false,
    fit_required: true,
    no_forced_product_match: true,
    smallest_sufficient_capability: true,
    read_only_discovery_before_commerce: true,
    discovery_creates_payment_obligation: false,
    checkout_requires_explicit_human_confirmation: true,
    checkout_is_payment_proof: false,
    paid_state_requires_authoritative_provider_verification: true,
    provider_publication_is_not_endorsement_or_pickup_proof: true
  },
  summary: {
    pain_index_entries: entries.length,
    unique_user_phrases: doors.length,
    mapped_candidate_edges: doors.reduce((sum, door) => sum + door.candidate_count, 0),
    ambiguous_phrases: doors.filter((door) => door.candidate_count > 1).length,
    product_candidates: entries.filter((entry) => entry.kind === 'product').length,
    machine_offer_candidates: entries.filter((entry) => entry.kind === 'machine_offer').length
  },
  doors: doors.map((door) => ({
    answer_id: door.answer_id,
    user_language: door.user_language,
    normalized: door.normalized,
    relative_json: door.relative_json,
    raw_json_url: door.raw_json_url,
    candidate_count: door.candidate_count,
    candidates: door.candidates.map((candidate) => ({
      capability_id: candidate.capability_id,
      kind: candidate.kind,
      product_key: candidate.product_key,
      public_id: candidate.public_id,
      name: candidate.name,
      commercial_state: candidate.commercial_state,
      machine_state: candidate.machine_state,
      pain_page: candidate.pain_page,
      public_url: candidate.public_url,
      registry_name: candidate.registry_name
    }))
  }))
};

fs.writeFileSync(path.join(OUTPUT_ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

const text = [
  '# Evercraft CHUM Answer Graph',
  '',
  'Start from the user\'s words. Brand seeding is not required.',
  `Read-only Official MCP Registry: ${index.read_only_registry_name}`,
  `Machine Commerce MCP: ${index.universal_mcp || 'not declared'}`,
  'Each phrase below maps to public capability candidates without upgrading readiness, pricing, invocation, payment, entitlement, or provider-pickup state.',
  'Discovery creates no payment obligation. Checkout requires explicit human confirmation and paid state requires authoritative provider verification.',
  '',
  'Pain-index entries: ' + index.summary.pain_index_entries,
  'Unique user phrases: ' + index.summary.unique_user_phrases,
  'Candidate edges: ' + index.summary.mapped_candidate_edges,
  'Ambiguous phrases: ' + index.summary.ambiguous_phrases,
  '',
  ...doors.flatMap((door) => [
    '## ' + door.user_language,
    'Answer ID: ' + door.answer_id,
    'Machine detail: ' + door.raw_json_url,
    'Candidates:',
    ...door.candidates.map((candidate) =>
      '- ' + candidate.name +
      ' | kind=' + candidate.kind +
      ' | commercial=' + candidate.commercial_state +
      ' | machine=' + candidate.machine_state +
      ' | public=' + (candidate.public_url || candidate.pain_page || 'discovery only')
    ),
    ''
  ])
];
fs.writeFileSync(path.join(OUTPUT_ROOT, 'index.txt'), text.join('\n') + '\n');

const html = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft CHUM Answer Graph</title>',
  '<meta name="description" content="Natural-language problems mapped to truthful public Evercraft capability candidates for AI assistants, agents, and people.">',
  '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
  '</head><body><main>',
  '<h1>Evercraft CHUM Answer Graph</h1>',
  '<p>Start from the user\'s words. These are discovery cues, not endorsements or forced product matches.</p>',
  `<p>Read-only MCP discovery: <code>${escapeHtml(index.read_only_registry_name)}</code></p>`,
  '<p>Discovery creates no payment obligation. Checkout requires explicit human confirmation and paid state requires authoritative provider verification.</p>',
  '<p><a href="./index.json">Machine-readable answer graph</a> · <a href="./index.txt">Plain-text answer graph</a> · <a href="/chum/pain-index.txt">Full pain index</a></p>',
  '<ul>',
  ...doors.map((door) =>
    '<li><strong>' + escapeHtml(door.user_language) + '</strong><ul>' +
    door.candidates.map((candidate) =>
      '<li><a href="' + escapeHtml(candidate.pain_page || candidate.public_url || '#') + '">' +
      escapeHtml(candidate.name) + '</a> ' +
      '<small>kind=' + escapeHtml(candidate.kind) +
      '; commercial=' + escapeHtml(candidate.commercial_state) +
      '; machine=' + escapeHtml(candidate.machine_state) + '</small></li>'
    ).join('') +
    '</ul></li>'
  ),
  '</ul>',
  '</main></body></html>'
];
fs.writeFileSync(path.join(OUTPUT_ROOT, 'index.html'), html.join('\n') + '\n');

console.log(JSON.stringify({
  schema: index.schema,
  pain_index_entries: index.summary.pain_index_entries,
  unique_user_phrases: index.summary.unique_user_phrases,
  mapped_candidate_edges: index.summary.mapped_candidate_edges,
  ambiguous_phrases: index.summary.ambiguous_phrases,
  outputs: [
    'public/chum/answers/index.html',
    'public/chum/answers/index.json',
    'public/chum/answers/index.txt',
    'public/chum/answers/doors/*.json'
  ]
}));
