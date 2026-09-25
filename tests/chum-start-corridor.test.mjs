import assert from 'node:assert/strict';
import {
  configuredChumPublicOrigin,
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

assert.equal(
  humanStartUrl(offer, { publicOrigin: '' }),
  review,
  'no live Forge origin must fail over to the live Machine Commerce review door'
);
assert.equal(
  humanStartState(offer, { publicOrigin: '' }),
  'machine_commerce_review_fallback'
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
  fallback_is_absolute: true,
  unverified_relative_route_published: false,
  tracked_corridor_requires_configured_https_origin: true
}));
