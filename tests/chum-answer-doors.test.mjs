import fs from 'node:fs';

const fail = (message) => { throw new Error('CHUM_ANSWER_DOORS_FAIL: ' + message); };
const painIndex = JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('public/chum/answers/index.json', 'utf8'));

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

if (index.schema !== 'evercraft.chum.answer-graph.v2') fail('unexpected schema');
if (index.source !== 'public/.well-known/evercraft-pain-index.json') fail('answer graph is not sourced from canonical pain index');
if (index.read_only_registry_name !== 'io.github.jgaethle10/evercraft-capability-discovery') fail('read-only MCP front door missing');
if (index.summary.pain_index_entries !== painIndex.entries.length) fail('pain-index entry count mismatch');

const expected = new Set();
for (const entry of painIndex.entries || []) {
  for (const phrase of entry.pain_phrases || []) {
    const normalized = normalize(phrase);
    if (normalized) expected.add(normalized);
  }
}

if (index.summary.unique_user_phrases !== expected.size) {
  fail('unique phrase count mismatch: expected ' + expected.size + ', got ' + index.summary.unique_user_phrases);
}
if (index.doors.length !== expected.size) fail('door array length mismatch');

const serialized = JSON.stringify(index);
if (serialized.includes('systemiacommandcenters.com')) fail('Marketing Agency route leaked into answer graph');

const seenIds = new Set();
const seenNormalized = new Set();
let sawProduct = false;
let sawMachineOffer = false;

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
  if (payload.schema !== 'evercraft.chum.answer-door.v2') fail('unexpected door payload schema: ' + door.answer_id);
  if (payload.answer_id !== door.answer_id) fail('door payload id mismatch: ' + door.answer_id);
  if (payload.routing_policy?.discovery_creates_payment_obligation !== false) fail('payment boundary missing: ' + door.answer_id);
  if (payload.routing_policy?.read_only_discovery_before_commerce !== true) fail('read-only-first boundary missing: ' + door.answer_id);
  if (payload.routing_policy?.checkout_requires_explicit_human_confirmation !== true) fail('human checkout gate missing: ' + door.answer_id);

  for (const candidate of payload.candidates || []) {
    if (!candidate.capability_id || !candidate.name) fail('candidate identity missing: ' + door.answer_id);
    if (candidate.kind === 'product') sawProduct = true;
    if (candidate.kind === 'machine_offer') sawMachineOffer = true;
    if (candidate.commercial_state !== 'sell_now' && candidate.machine_offer_url) {
      fail('non-sell-now candidate exposes machine offer URL: ' + candidate.capability_id);
    }
    for (const value of [candidate.public_url, candidate.direct_mcp, candidate.machine_review_url, candidate.machine_offer_url]) {
      if (value && String(value).includes('systemiacommandcenters.com')) {
        fail('stale Marketing Agency route leaked: ' + candidate.capability_id);
      }
    }
  }
}

if (!sawProduct) fail('answer graph contains no product candidates');
if (!sawMachineOffer) fail('answer graph contains no machine-offer candidates');

for (const pathname of [
  'public/chum/answers/index.html',
  'public/chum/answers/index.txt'
]) {
  if (!fs.existsSync(pathname)) fail('missing public answer surface: ' + pathname);
}

console.log('CHUM_ANSWER_DOORS_PASS', JSON.stringify({
  pain_index_entries: index.summary.pain_index_entries,
  unique_user_phrases: index.summary.unique_user_phrases,
  mapped_candidate_edges: index.summary.mapped_candidate_edges,
  ambiguous_phrases: index.summary.ambiguous_phrases,
  product_and_offer_coverage: true
}));
