import assert from 'node:assert/strict';
import {
  buyerFrontageUrl,
  configuredChumPublicOrigin,
  configuredMachineCommerceGateway,
  directHumanBuyerUrl,
  humanStartState,
  humanStartUrl,
  machineReviewUrl
} from '../systemia/chum/start-corridor.mjs';

const offer = {
  public_id: 'career-command-interview-practice-machine-v1',
  commercial_state: 'sell_now'
};

assert.equal(configuredChumPublicOrigin(''), null);
assert.equal(configuredChumPublicOrigin('http://forge.example.com'), null);
assert.equal(configuredChumPublicOrigin('https://legacy.base44.app'), null);
assert.equal(configuredChumPublicOrigin('https://forge.evercraft.example/some/path'), 'https://forge.evercraft.example');

assert.equal(configuredMachineCommerceGateway(''), null);
assert.equal(configuredMachineCommerceGateway('https://legacy.base44.app/functions/gateway'), null);
assert.equal(
  configuredMachineCommerceGateway('https://commerce.evercraft.example/gateway'),
  'https://commerce.evercraft.example/gateway'
);

assert.equal(directHumanBuyerUrl(offer, { surface: 'test_surface' }), null);
assert.equal(buyerFrontageUrl(offer, { publicOrigin: '' }), null);
assert.equal(machineReviewUrl(offer.public_id, ''), null);

const frontage = buyerFrontageUrl(offer, {
  publicOrigin: 'https://forge.evercraft.example',
  surface: 'test_surface'
});
assert.equal(new URL(frontage).origin, 'https://forge.evercraft.example');
assert.match(frontage, /\/buy\/career-command-interview-practice-machine-v1\?/);
assert.match(frontage, /src=chum/);
assert.match(frontage, /campaign=buyer-frontage/);
assert.match(frontage, /ec_surface=test_surface/);

assert.equal(
  humanStartUrl(offer, { publicOrigin: '', gateway: '' }),
  null,
  'without an owned public origin or owned commerce gateway the corridor must fail closed'
);
assert.equal(
  humanStartState(offer, { publicOrigin: '', gateway: '' }),
  'blocked_no_owned_handoff'
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
  'owned_chum_handoff_configured'
);

const review = machineReviewUrl(
  offer.public_id,
  'https://commerce.evercraft.example/machine-review'
);
assert.match(review, /^https:\/\/commerce\.evercraft\.example\/machine-review\?/);
assert.match(review, /public_id=career-command-interview-practice-machine-v1/);
assert.equal(
  humanStartState(offer, { publicOrigin: '', gateway: 'https://commerce.evercraft.example/machine-review' }),
  'owned_machine_commerce_gateway'
);

assert.equal(
  humanStartUrl({ ...offer, commercial_state: 'discovery_only' }, { publicOrigin: 'https://forge.evercraft.example' }),
  null
);

console.log(JSON.stringify({
  ok: true,
  base44_rejected: true,
  unconfigured_corridor_fails_closed: true,
  owned_buyer_frontage: true,
  owned_machine_review_optional: true
}));
