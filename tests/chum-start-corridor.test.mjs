import assert from 'node:assert/strict';
import {
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

assert.equal(
  humanStartUrl(offer, { publicOrigin: '', surface: 'test_surface' }),
  direct,
  'when Forge origin is unavailable, use the clean verified product buyer destination before exposing machine plumbing'
);
assert.equal(
  humanStartState(offer, { publicOrigin: '' }),
  'direct_human_buyer_destination'
);

const rivet = {
  public_id: 'rivet-site-underwriting-v1',
  commercial_state: 'sell_now'
};
assert.match(
  humanStartUrl(rivet, { publicOrigin: '' }),
  /^https:\/\/rivet\.base44\.app\//
);

const handoffOnly = {
  public_id: 'foundry-app-escape-audit-v1',
  commercial_state: 'sell_now'
};
assert.equal(
  humanStartUrl(handoffOnly, { publicOrigin: '' }),
  machineReviewUrl(handoffOnly.public_id),
  'handoff-only services without a verified clean buyer app retain the human-readable Machine Commerce review page'
);
assert.equal(
  humanStartState(handoffOnly, { publicOrigin: '' }),
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
  direct_human_buyer_destination: true,
  rivet_clean_buyer_frontage: true,
  machine_review_is_last_fallback: true,
  tracked_corridor_requires_configured_https_origin: true
}));
