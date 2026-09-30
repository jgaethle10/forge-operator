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

const offer={
  public_id:'career-command-interview-practice-machine-v1',
  commercial_state:'sell_now'
};

assert.equal(BUYER_FRONTAGE_GATEWAY,'');
assert.equal(machineReviewUrl(offer.public_id),'/buy/career-command-interview-practice-machine-v1');
assert.equal(configuredChumPublicOrigin(''),null);
assert.equal(configuredChumPublicOrigin('http://forge.example.com'),null);
assert.equal(configuredChumPublicOrigin('https://systemiacommandcenters.com'),null);
assert.equal(configuredChumPublicOrigin('https://legacy.base44.app'),null);

assert.equal(directHumanBuyerUrl(offer,{surface:'test_surface'}),null);

const frontage=buyerFrontageUrl(offer,{surface:'test_surface',gateway:''});
assert.match(frontage,/^\/buy\/career-command-interview-practice-machine-v1\?/);
assert.match(frontage,/src=chum/);
assert.match(frontage,/campaign=buyer-frontage/);
assert.match(frontage,/ec_surface=test_surface/);
assert.match(frontage,/ec_public_id=career-command-interview-practice-machine-v1/);
assert.doesNotMatch(frontage,/base44/i);

assert.equal(
  humanStartUrl(offer,{publicOrigin:'',surface:'test_surface'}),
  frontage,
  'when the owned public origin is unavailable, preserve an owned relative review route rather than falling back to Base44'
);
assert.equal(
  humanStartState(offer,{publicOrigin:''}),
  'owned_relative_buyer_frontage'
);

const rivet={
  public_id:'rivet-site-underwriting-v1',
  commercial_state:'sell_now'
};
assert.match(
  humanStartUrl(rivet,{publicOrigin:''}),
  /^\/buy\/rivet-site-underwriting-v1\?/
);

const handoffOnly={
  public_id:'foundry-app-escape-audit-v1',
  commercial_state:'sell_now'
};
assert.match(
  humanStartUrl(handoffOnly,{publicOrigin:''}),
  /^\/buy\/foundry-app-escape-audit-v1\?/
);

const live=humanStartUrl(offer,{
  publicOrigin:'https://forge.evercraft.example/some/path',
  surface:'test_surface'
});
assert.equal(
  live,
  'https://forge.evercraft.example/api/chum/go/career-command-interview-practice-machine-v1?surface=test_surface'
);
assert.equal(
  humanStartState(offer,{publicOrigin:'https://forge.evercraft.example'}),
  'tracked_chum_handoff_configured_origin'
);

assert.equal(
  humanStartUrl({...offer,commercial_state:'discovery_only'},{publicOrigin:'https://forge.evercraft.example'}),
  null
);

console.log(JSON.stringify({
  ok:true,
  base44_default_fallback:false,
  owned_relative_buyer_frontage:true,
  direct_legacy_product_fallback:false,
  tracked_corridor_requires_configured_https_origin:true
}));
