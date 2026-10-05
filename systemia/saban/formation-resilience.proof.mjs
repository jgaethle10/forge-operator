import assert from 'node:assert/strict';
import { nodePoolOptionsForExecution } from './formation.mjs';

const defaults=nodePoolOptionsForExecution({
  execution:{mode:'nodeseed_pool'},
},{
  EVERCRAFT_ALLOCATOR_TOKEN:'proof-allocator',
});
assert.equal(defaults.discover,true);
assert.equal(defaults.acquisition.enabled,true);
assert.equal(defaults.acquisition.auto_discover_markets,true);
assert.equal(defaults.acquisition.public_market_discovery,false);
assert.equal(defaults.allocatorToken,'proof-allocator');
assert.equal(defaults.acquisition.lease_authority,undefined);
assert.equal(defaults.acquisition.leaseAuthority,undefined);

const explicitOff=nodePoolOptionsForExecution({
  execution:{
    mode:'nodeseed_pool',
    discover:false,
    acquisition:false,
  },
},{});
assert.equal(explicitOff.discover,false);
assert.equal(explicitOff.acquisition.enabled,false);

const configured=nodePoolOptionsForExecution({
  execution:{
    mode:'nodeseed_pool',
    acquisition:{
      markets:['evercraft-broker','akash'],
      public_market_discovery:true,
      max_total_usd:5,
      lease_authority:{
        schema:'evercraft.saban.compute-authority.v1',
        approved:true,
        demand_id:'proof',
        allowed_markets:['akash'],
        max_total_usd:5,
      },
    },
  },
},{});
assert.deepEqual(configured.acquisition.markets,['evercraft-broker','akash']);
assert.equal(configured.acquisition.public_market_discovery,true);
assert.equal(configured.acquisition.max_total_usd,5);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.formation-resilience-proof.v1',
  nodeseed_discovery_default_on:true,
  resilient_acquisition_default_on:true,
  public_paid_market_discovery_default_off:true,
  paid_lease_authority_not_invented:true,
  explicit_disable_honored:true,
},null,2));
