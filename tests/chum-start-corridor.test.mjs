import assert from 'node:assert/strict';
import {
  BUYER_FRONTAGE_GATEWAY,
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

assert.equal(BUYER_FRONTAGE_GATEWAY, '');
assert.equal(machineReviewUrl(offer.public_id), null);
assert.equal(configuredChumPublicOrigin(''), null);
assert.equal(configuredChumPublicOrigin('http://forge.example.com'), null);
assert.equal(configuredChumPublicOrigin('https://systemiacommandcenters.com'), null);
assert.equal(configuredChumPublicOrigin('https://aliev.base44.app'), null);

assert.equal(directHumanBuyerUrl(offer, { surface: 'test_surface' }), null);
assert.equal(buyerFrontageUrl(offer, { surface: 'test_surface' }), null);
assert.equal(
  humanStartUrl(offer, { publicOrigin: '', surface: 'test_surface' }),
  null,
  'without a verified owned public origin, paid/start routing must stay held instead of falling back to Base44'
);
assert.equal(
  humanStartState(offer, { publicOrigin: '' }),
  'migration_hold_no_owned_start_route'
);

const ownedReview = machineReviewUrl(
  offer.public_id,
  'https://commerce.evercraft.example/review'
);
assert.match(ownedReview, /^https:\/\/commerce\.evercraft\.example\/review\?/);
assert.match(ownedReview, /public_id=career-command-interview-practice-machine-v1/);
assert.equal(
  machineReviewUrl(offer.public_id, 'https://event-wave.base44.app/functions/gateway'),
  null
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
  base44_fallback_forbidden: true,
  unverified_start_routes_fail_closed: true,
  tracked_corridor_requires_configured_owned_https_origin: true
}));
