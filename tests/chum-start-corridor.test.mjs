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

assert.equal(
  humanStartUrl(offer, { publicOrigin: '', surface: 'test_surface' }),
  frontage,
  'when Forge origin is unavailable, keep the first human click on the branded central buyer frontage'
);
assert.equal(
  humanStartState(offer, { publicOrigin: '' }),
  'central_buyer_frontage'
);

const rivet = {
  public_id: 'rivet-site-underwriting-v1',
  commercial_state: 'sell_now'
};
assert.match(
  humanStartUrl(rivet, { publicOrigin: '' }),
  /^https:\/\/evercraft-ai-suite-08c4d2b8\.base44\.app\/buy\/rivet-site-underwriting-v1\?/
);

const handoffOnly = {
  public_id: 'foundry-app-escape-audit-v1',
  commercial_state: 'sell_now'
};
assert.match(
  humanStartUrl(handoffOnly, { publicOrigin: '' }),
  /^https:\/\/evercraft-ai-suite-08c4d2b8\.base44\.app\/buy\/foundry-app-escape-audit-v1\?/,
  'handoff-only services use the same branded buyer review frontage rather than exposing Machine Commerce plumbing'
);
assert.equal(
  humanStartState(handoffOnly, { publicOrigin: '' }),
  'central_buyer_frontage'
);

const live = humanStartUrl(offer, {
  publicOrigin: 'https://forge.evercraft.example/some/path',
  surface: 'test_surface'
});
assert.equal(
  live,
  'https://forge.evercraft.example/api/chum/go/career-command-interview-practice-machine-v1?surface=test_surface'
);
assert.equal(
  humanStartState(offer, { publicOrigin: 'https://forge.evercraft.example' }),
  'tracked_chum_handoff_configured_origin'
);

assert.equal(
  humanStartUrl({ ...offer, commercial_state: 'discovery_only' }, { publicOrigin: 'https://forge.evercraft.example' }),
  null
);

console.log(JSON.stringify({
  ok: true,
  central_buyer_frontage_for_all_sell_now: true,
  direct_human_buyer_destination_still_available_downstream: Boolean(direct),
  machine_review_is_last_fallback: true,
  tracked_corridor_requires_configured_https_origin: true
}));
