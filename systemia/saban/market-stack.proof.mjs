import assert from 'node:assert/strict';
import { buildSabanComputeMarketStack } from './market-stack.mjs';

const fakeYard={
  async listRemoteCapacityNodes(){return {nodes:[]};},
  async remoteCapacityGrant(){throw new Error('not_expected');},
};

const stack=await buildSabanComputeMarketStack({
  yard:fakeYard,
  brokerDeploymentId:'broker-proof',
  voluntaryEndpoint:'http://127.0.0.1:9999',
  voluntaryControlHeaders:{authorization:'Bearer proof'},
  includeGolem:false,
  includeAkash:true,
});

assert.deepEqual(
  stack.adapters.map((adapter)=>adapter.market),
  ['evercraft-broker','evercraft-voluntary','akash']
);
assert.deepEqual(
  stack.inventory.map((row)=>row.priority),
  [10,20,40]
);
assert.equal(stack.doctrine.visibility_is_not_authorization,true);
assert.equal(
  stack.inventory.find((row)=>row.market==='evercraft-voluntary').execution_capable,
  true
);

const externalOnly=await buildSabanComputeMarketStack({
  includeAkash:true,
  includeGolem:false,
});
assert.deepEqual(externalOnly.adapters.map((adapter)=>adapter.market),['akash']);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.compute-market-stack-proof.v1',
  owned_first:true,
  voluntary_second:true,
  external_fallback:true,
  markets:stack.adapters.map((adapter)=>adapter.market),
},null,2));
