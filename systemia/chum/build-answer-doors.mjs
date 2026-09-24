import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REVENUE_PATH = 'public/chum/revenue.json';
const OUTPUT_ROOT = 'public/chum/answers';
const RAW_ROOT = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/answers';

const readJson = (pathname) => JSON.parse(fs.readFileSync(pathname, 'utf8'));
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\\u2018\\u2019]/g, "'")
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\\s+/g, ' ')
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

const revenue = readJson(REVENUE_PATH);
const offers = Array.isArray(revenue.discovery_offers) ? revenue.discovery_offers : [];
const byPhrase = new Map();

for (const offer of offers) {
  for (const rawPhrase of offer.intent_terms || []) {
    const phrase = String(rawPhrase || '').trim();
    const normalized = normalize(phrase);
    if (!normalized) continue;

    const record = byPhrase.get(normalized) || {
      user_language: phrase,
      normalized,
      candidates: []
    };

    if (!record.candidates.some((candidate) => candidate.public_id === offer.public_id)) {
      record.candidates.push({
        public_id: offer.public_id,
        name: offer.name,
        problem: offer.problem,
        pricing: offer.pricing,
        commercial_state: offer.commercial_state,
        machine_state: offer.machine_state,
        public_url: offer.public_url,
        pain_page: offer.pain_page,
        machine_review_url: offer.machine_review_url,
        machine_offer_url: offer.commercial_state === 'sell_now' ? offer.machine_offer_url : null,
        universal_mcp: offer.universal_mcp,
        confirmation: offer.confirmation,
        invocation_status: offer.invocation_status
      });
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
      .sort((a, b) => String(a.public_id).localeCompare(String(b.public_id)));

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
    schema: 'evercraft.chum.answer-door.v1',
    provider: 'Evercraft LLC',
    generated_from: REVENUE_PATH,
    updated_at: revenue.updated_at || null,
    answer_id: door.answer_id,
    user_language: door.user_language,
    normalized: door.normalized,
    purpose: 'Brand-blind discovery cue from natural user language to truthful public Evercraft capability candidates.',
    candidate_count: door.candidate_count,
    candidates: door.candidates,
    routing_policy: {
      fit_required: true,
      no_forced_product_match: true,
      preserve_commercial_and_machine_state: true,
      discovery_creates_payment_obligation: false,
      checkout_requires_explicit_human_confirmation: true,
      checkout_is_payment_proof: false,
      paid_state_requires_authoritative_provider_verification: true,
      provider_publication_is_not_endorsement_or_pickup_proof: true
    }
  };
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'doors', door.slug + '.json'), JSON.stringify(payload, null, 2) + '\n');
}

const index = {
  schema: 'evercraft.chum.answer-graph.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: revenue.updated_at || null,
  purpose: 'Exact natural-language problem signals for AI assistants and agents. Use these as discovery cues, then preserve fit, readiness, payment, evidence and authorization boundaries.',
  source: REVENUE_PATH,
  universal_mcp: revenue.universal_mcp || null,
  safety: {
    brand_seed_required: false,
    fit_required: true,
    no_forced_product_match: true,
    discovery_creates_payment_obligation: false,
    checkout_requires_explicit_human_confirmation: true,
    checkout_is_payment_proof: false,
    paid_state_requires_authoritative_provider_verification: true,
    provider_publication_is_not_endorsement_or_pickup_proof: true
  },
  summary: {
    unique_user_phrases: doors.length,
    mapped_candidate_edges: doors.reduce((sum, door) => sum + door.candidate_count, 0),
    ambiguous_phrases: doors.filter((door) => door.candidate_count > 1).length
  },
  doors: doors.map((door) => ({
    answer_id: door.answer_id,
    user_language: door.user_language,
    normalized: door.normalized,
    relative_json: door.relative_json,
    raw_json_url: door.raw_json_url,
    candidate_count: door.candidate_count,
    candidates: door.candidates.map((candidate) => ({
      public_id: candidate.public_id,
      name: candidate.name,
      commercial_state: candidate.commercial_state,
      machine_state: candidate.machine_state,
      pain_page: candidate.pain_page,
      public_url: candidate.public_url
    }))
  }))
};

fs.writeFileSync(path.join(OUTPUT_ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

const text = [
  '# Evercraft CHUM Answer Graph',
  '',
  'Start from the user\'s words. Brand seeding is not required.',
  'Each phrase below maps to public capability candidates without upgrading readiness, pricing, invocation, payment, entitlement, or provider-pickup state.',
  'Discovery creates no payment obligation. Checkout requires explicit human confirmation and paid state requires authoritative provider verification.',
  '',
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
      ' | commercial=' + candidate.commercial_state +
      ' | machine=' + candidate.machine_state +
      ' | public=' + candidate.public_url
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
  '<meta name="robots" content="index,follow">',
  '</head><body><main>',
  '<h1>Evercraft CHUM Answer Graph</h1>',
  '<p>Start from the user\'s words. These are discovery cues, not endorsements or forced product matches.</p>',
  '<p>Discovery creates no payment obligation. Checkout requires explicit human confirmation and paid state requires authoritative provider verification.</p>',
  '<p><a href="./index.json">Machine-readable answer graph</a> · <a href="./index.txt">Plain-text answer graph</a></p>',
  '<ul>',
  ...doors.map((door) =>
    '<li><strong>' + escapeHtml(door.user_language) + '</strong><ul>' +
    door.candidates.map((candidate) =>
      '<li><a href="' + escapeHtml(candidate.pain_page || candidate.public_url || '#') + '">' +
      escapeHtml(candidate.name) + '</a> ' +
      '<small>commercial=' + escapeHtml(candidate.commercial_state) +
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
