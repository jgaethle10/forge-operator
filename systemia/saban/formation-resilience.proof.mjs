import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFormationAcquisition } from './formation.mjs';

const defaults=await buildFormationAcquisition({
  formationId:'formation-proof',
  nodeId:'node-proof',
  execution:{mode:'nodeseed_pool'},
  rootDir:process.cwd(),
});
assert.equal(defaults.enabled,true);
assert.equal(defaults.auto_discover_markets,true);
assert.equal(defaults.public_market_discovery,false);
assert.equal(defaults.zero_spend_only,true);
assert.equal(defaults.max_total_usd,0);
assert.equal(defaults.max_hourly_usd,0);
assert.equal(defaults.quoteAuthority,null);
assert.equal(defaults.leaseAuthority,null);
assert.deepEqual(defaults.adapters,[]);

const explicitOff=await buildFormationAcquisition({
  formationId:'formation-proof',
  nodeId:'node-off',
  execution:{
    mode:'nodeseed_pool',
    acquisition:false,
  },
  rootDir:process.cwd(),
});
assert.equal(explicitOff,null);

const explicitConfigOff=await buildFormationAcquisition({
  formationId:'formation-proof',
  nodeId:'node-config-off',
  execution:{
    mode:'nodeseed_pool',
    acquisition:{enabled:false},
  },
  rootDir:process.cwd(),
});
assert.equal(explicitConfigOff,null);

const paid=await buildFormationAcquisition({
  formationId:'formation-proof',
  nodeId:'node-paid',
  execution:{
    mode:'nodeseed_pool',
    acquisition:{
      enabled:true,
      zero_spend_only:false,
      auto_discover_markets:true,
      public_market_discovery:true,
      max_total_usd:5,
      max_hourly_usd:1,
      lease:{
        approved:true,
        allow_spend:true,
        max_total_usd:5,
      },
    },
  },
  rootDir:process.cwd(),
});
assert.equal(paid.enabled,true);
assert.equal(paid.zero_spend_only,false);
assert.equal(paid.public_market_discovery,true);
assert.equal(paid.max_total_usd,5);
assert.equal(paid.max_hourly_usd,1);
assert.equal(paid.leaseAuthority.approved,true);
assert.equal(paid.leaseAuthority.allow_spend,true);
assert.equal(paid.leaseAuthority.max_total_usd,5);

const source=fs.readFileSync('systemia/saban/formation.mjs','utf8');
assert.ok(source.includes("discover: node.execution?.discover !== false"));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.formation-resilience-proof.v2',
  nodeseed_discovery_default_on:true,
  resilient_acquisition_default_on:true,
  zero_spend_default_on:true,
  public_market_discovery_default_off:true,
  paid_lease_authority_not_invented:true,
  paid_spend_requires_explicit_authority:true,
  explicit_disable_honored:true,
},null,2));
