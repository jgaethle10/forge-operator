import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  buyerFrontageUrl,
  configuredChumPublicOrigin,
  directHumanBuyerUrl,
  humanStartState,
  humanStartUrl,
  machineReviewUrl
} from '../systemia/chum/start-corridor.mjs';

const offer = {
  public_id: 'career-command-interview-practice-machine-v1',
  commercial_state: 'sell_now'
};

const review = machineReviewUrl(offer.public_id);
assert.match(review, /^https:\/\//);

assert.equal(configuredChumPublicOrigin(''), null);
assert.equal(configuredChumPublicOrigin('http://forge.example.com'), null);
assert.equal(configuredChumPublicOrigin('https://systemiacommandcenters.com'), null);

const direct = directHumanBuyerUrl(offer, { surface: 'test_surface' });
assert.match(direct, /^https:\/\/evercraft-career-command\.base44\.app\//);
assert.match(direct, /src=chum/);
assert.match(direct, /campaign=buyer-frontage/);
assert.match(direct, /ec_surface=test_surface/);
assert.match(direct, /ec_public_id=career-command-interview-practice-machine-v1/);

const frontage = buyerFrontageUrl(offer, { surface: 'test_surface' });
assert.match(frontage, /^https:\/\/evercraft-ai-suite-08c4d2b8\.base44\.app\/buy\/career-command-interview-practice-machine-v1\?/);
assert.match(frontage, /src=chum/);
assert.match(frontage, /campaign=buyer-frontage/);
assert.match(frontage, /ec_surface=test_surface/);
assert.match(frontage, /ec_public_id=career-command-interview-practice-machine-v1/);

assert.equal(
  humanStartUrl(offer, { surface: 'test_surface' }),
  frontage,
  'all sell-now offers enter through the universal Evercraft buyer frontage before any downstream product or machine route'
);
assert.equal(
  humanStartState(offer),
  'universal_buyer_frontage'
);

const rivet = {
  public_id: 'rivet-site-underwriting-v1',
  commercial_state: 'sell_now'
};
assert.match(
  humanStartUrl(rivet, { surface: 'test_surface' }),
  /^https:\/\/evercraft-ai-suite-08c4d2b8\.base44\.app\/buy\/rivet-site-underwriting-v1\?/
);

const handoffOnly = {
  public_id: 'foundry-app-escape-audit-v1',
  commercial_state: 'sell_now'
};
assert.match(
  humanStartUrl(handoffOnly, { surface: 'test_surface' }),
  /^https:\/\/evercraft-ai-suite-08c4d2b8\.base44\.app\/buy\/foundry-app-escape-audit-v1\?/,
  'fixed-price human-handoff services use the same trustworthy buyer frontage instead of exposing Machine Commerce plumbing'
);
assert.equal(
  humanStartState(handoffOnly),
  'universal_buyer_frontage'
);

const badFrontage = humanStartUrl(offer, {
  surface: 'test_surface',
  frontageOrigin: 'http://not-secure.example'
});
assert.equal(
  badFrontage,
  direct,
  'if the universal frontage origin is invalid, the corridor still falls back to a clean product buyer destination before machine plumbing'
);

assert.equal(
  humanStartUrl({ ...offer, commercial_state: 'discovery_only' }),
  null
);

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8'));
const everySellNow = (catalog.offers || []).filter((row) => row?.commercial_state === 'sell_now');
assert.equal(everySellNow.length, 13);
for (const row of everySellNow) {
  const url = humanStartUrl(row, { surface: 'catalog_regression' });
  assert.match(
    url,
    new RegExp('^https://evercraft-ai-suite-08c4d2b8\\.base44\\.app/buy/' + row.public_id.replace(/[.*+?^$()|[\\]{}]/g, '\\assert.equal(
  humanStartUrl({ ...offer, commercial_state: 'discovery_only' }),
  null
);

') + '\\?'),
    row.public_id + ' must enter through the universal buyer frontage'
  );
  assert.equal(humanStartState(row), 'universal_buyer_frontage');
}

console.log(JSON.stringify({
  ok: true,
  universal_buyer_frontage: true,
  downstream_direct_human_buyer_destination_preserved: true,
  rivet_universal_frontage: true,
  fixed_price_handoff_universal_frontage: true,
  machine_review_is_last_fallback: true
}));
