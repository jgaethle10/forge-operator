import fs from 'node:fs';

const fail = (message) => { throw new Error('CHUM_OBSERVED_MISS_FAIL: ' + message); };
const indexPath = 'public/chum/answers/observed/index.json';
if (!fs.existsSync(indexPath)) fail('observed miss index missing');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
if (index.schema !== 'evercraft.chum.observed-miss-index.v1') fail('unexpected schema');
if (!Array.isArray(index.pages) || index.pages.length < 1) fail('no observed miss pages generated');

const forensi = index.pages.find((page) =>
  page.product_key === 'forensiscope' &&
  /inspect a long video/i.test(page.user_question || '')
);
if (!forensi) fail('ForensiScope benchmark question missing');

for (const page of index.pages) {
  const html = 'public' + page.relative_html + 'index.html';
  const json = 'public' + page.relative_json;
  const llms = 'public' + page.relative_llms;
  for (const pathname of [html, json, llms]) if (!fs.existsSync(pathname)) fail('missing observed page artifact: ' + pathname);
  const payload = JSON.parse(fs.readFileSync(json, 'utf8'));
  if (payload.truth_boundary?.provider_pickup_claimed !== false) fail('provider pickup boundary missing');
  if (payload.truth_boundary?.provider_endorsement_claimed !== false) fail('provider endorsement boundary missing');
  if (payload.truth_boundary?.discovery_creates_payment_obligation !== false) fail('payment boundary missing');
}

console.log('CHUM_OBSERVED_MISS_PASS', JSON.stringify({
  pages: index.pages.length,
  forensiscope_observed_providers: forensi.observed_providers
}));
