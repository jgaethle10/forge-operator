import fs from 'node:fs';

const fail = (message) => { throw new Error('CHUM_ANSWER_DOORS_FAIL: ' + message); };
const revenue = JSON.parse(fs.readFileSync('public/chum/revenue.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('public/chum/answers/index.json', 'utf8'));

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\\u2018\\u2019]/g, "'")
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();

if (index.schema !== 'evercraft.chum.answer-graph.v1') fail('unexpected schema');

const expected = new Set();
for (const offer of revenue.discovery_offers || []) {
  for (const phrase of offer.intent_terms || []) {
    const normalized = normalize(phrase);
    if (normalized) expected.add(normalized);
  }
}

if (index.summary.unique_user_phrases !== expected.size) {
  fail('unique phrase count mismatch: expected ' + expected.size + ', got ' + index.summary.unique_user_phrases);
}
if (index.doors.length !== expected.size) fail('door array length mismatch');

const seenIds = new Set();
const seenNormalized = new Set();
for (const door of index.doors) {
  if (!door.answer_id || seenIds.has(door.answer_id)) fail('duplicate or missing answer_id');
  seenIds.add(door.answer_id);
  if (!door.normalized || seenNormalized.has(door.normalized)) fail('duplicate or missing normalized phrase');
  seenNormalized.add(door.normalized);
  if (!expected.has(door.normalized)) fail('unexpected phrase: ' + door.normalized);
  if (!Array.isArray(door.candidates) || door.candidates.length < 1) fail('door has no candidates: ' + door.answer_id);
  if (!door.relative_json || !door.raw_json_url) fail('door lacks machine link: ' + door.answer_id);

  const localPath = 'public' + door.relative_json;
  if (!fs.existsSync(localPath)) fail('missing door JSON: ' + localPath);
  const payload = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if (payload.answer_id !== door.answer_id) fail('door payload id mismatch: ' + door.answer_id);
  if (payload.routing_policy?.discovery_creates_payment_obligation !== false) fail('payment boundary missing: ' + door.answer_id);
  if (payload.routing_policy?.checkout_requires_explicit_human_confirmation !== true) fail('human checkout gate missing: ' + door.answer_id);

  for (const candidate of payload.candidates || []) {
    if (!candidate.public_id || !candidate.name) fail('candidate identity missing: ' + door.answer_id);
    if (candidate.commercial_state !== 'sell_now' && candidate.machine_offer_url) {
      fail('non-sell-now candidate exposes machine offer URL: ' + candidate.public_id);
    }
  }
}

for (const pathname of [
  'public/chum/answers/index.html',
  'public/chum/answers/index.txt'
]) {
  if (!fs.existsSync(pathname)) fail('missing public answer surface: ' + pathname);
}

console.log('CHUM_ANSWER_DOORS_PASS', JSON.stringify({
  unique_user_phrases: index.summary.unique_user_phrases,
  mapped_candidate_edges: index.summary.mapped_candidate_edges,
  ambiguous_phrases: index.summary.ambiguous_phrases
}));
