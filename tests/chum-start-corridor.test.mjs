import assert from 'node:assert/strict';
import {
  BUYER_FRONTAGE_GATEWAY,
  buyerFrontageUrl,
  configuredChumPublicOrigin,
  directHumanBuyerUrl,
  humanStartState,
  humanStartUrl,
  machineReviewUrl,
  staticCommercialReviewUrl
} from '../systemia/chum/start-corridor.mjs';

const offer = {
  public_id: 'career-command-interview-practice-machine-v1',
  commercial_state: 'sell_now'
};

assert.equal(BUYER_FRONTAGE_GATEWAY, null);
assert.equal(machineReviewUrl(offer.public_id), null);
assert.equal(configuredChumPublicOrigin(''), null);
assert.equal(configuredChumPublicOrigin('http://forge.example.com'), null);
assert.equal(configuredChumPublicOrigin('https://systemiacommandcenters.com'), null);
assert.equal(configuredChumPublicOrigin('https://legacy.example.base44.app/'), null);
assert.equal(directHumanBuyerUrl(offer, { surface: 'test_surface' }), null);
assert.equal(buyerFrontageUrl(offer, { surface: 'test_surface' }), null);
assert.equal(
  staticCommercialReviewUrl(offer.public_id),
  '/chum/commercial/career-command-interview-practice-machine-v1/'
);
assert.equal(
  humanStartUrl(offer, { publicOrigin: '', surface: 'test_surface' }),
  '/chum/commercial/career-command-interview-practice-machine-v1/'
);
assert.equal(humanStartState(offer, { publicOrigin: '' }), 'owned_static_commercial_surface');

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

const ownedReview = machineReviewUrl(offer.public_id, 'https://commerce.evercraft.example/review');
assert.match(ownedReview, /^https:\/\/commerce\.evercraft\.example\/review\?/);
assert.match(ownedReview, /public_id=career-command-interview-practice-machine-v1/);

const ownedFrontage = buyerFrontageUrl(offer, {
  surface: 'test_surface',
  gateway: 'https://commerce.evercraft.example'
});
assert.match(ownedFrontage, /^https:\/\/commerce\.evercraft\.example\/buy\//);
assert.match(ownedFrontage, /ec_surface=test_surface/);

assert.equal(
  humanStartUrl({ ...offer, commercial_state: 'discovery_only' }, { publicOrigin: 'https://forge.evercraft.example' }),
  null
);

console.log(JSON.stringify({
  ok: true,
  legacy_provider_default_routes_removed: true,
  no_unowned_fallback: true,
  owned_static_sell_now_fallback: true,
  configured_https_origin_upgrades_static_fallback: true
}));
