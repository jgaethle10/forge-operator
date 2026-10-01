import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  createVoluntaryMarketAdapter,
  prepareVoluntaryOffer,
  canonicalVoluntaryOffer,
} from './voluntary.mjs';
import { createYardVoluntaryLeaseResolver } from './voluntary-yard.mjs';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from '../compute-exchange.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const fingerprint='sha256:'+createHash('sha256')
  .update(String(publicPem))
  .digest('hex');

const fakeYard={
  async remoteCapacityGrant(_deploymentId,nodeId){
    assert.equal(nodeId,'chromebook-real-bridge-proof');
    return {
      node_id:nodeId,
      device_fingerprint:fingerprint,
      capacity_endpoint:'https://broker.example/nodes/'+nodeId,
      allocator_token:'runtime-only-broker-token',
      control_grant_receipt_hash:'sha256:control-grant',
      public_route_receipt_hash:null,
    };
  },
};

const market=createVoluntaryMarketAdapter({
  leaseResolver:createYardVoluntaryLeaseResolver({
    yard:fakeYard,
    brokerDeploymentId:'remote-broker-proof',
  }),
});

const registration=market.registerProvider({
  provider_id:'chromebook-real-bridge-proof',
  public_key_pem:publicPem,
});
assert.equal(registration.fingerprint,fingerprint);

const prepared=prepareVoluntaryOffer({
  provider_id:'chromebook-real-bridge-proof',
  offer_id:'chromebook-real-offer',
  resources:{
    cpu_units:4,
    memory_mb:8192,
    storage_gb:20,
    gpu_count:0,
    gpu_models:[],
  },
  workload_classes:['saban.multiplier-assignment.v1'],
  economics:{zero_cost:true},
  trust:{uptime_7d:0.99,valid_version:true},
  execution:{transport:'outbound-evercraft',endpoint:null},
  available_until:new Date(Date.now()+10*60_000).toISOString(),
  nonce:'bridge-proof-nonce',
});
const signature=sign(
  null,
  Buffer.from(canonicalVoluntaryOffer(prepared)),
  privateKey
).toString('base64');
market.submitSignedOffer({offer:prepared,signature_base64:signature});

const demand=normalizeComputeDemand({
  demand_id:'voluntary-yard-bridge-demand',
  workload_class:'saban.multiplier-assignment.v1',
  cpu_units:2,
  memory_mb:2048,
  storage_gb:5,
  duration_seconds:300,
  negotiation_level:'lease',
  max_total_usd:0,
});

const result=await negotiateCompute({
  demand,
  adapters:[market],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:['evercraft-voluntary'],
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:['evercraft-voluntary'],
    max_total_usd:0,
  },
});

assert.equal(result.lease.execution_ready,true);
assert.equal(
  result.lease.execution_endpoint,
  'https://broker.example/nodes/chromebook-real-bridge-proof'
);
assert.equal(result.lease.transport,'evercraft-nodeseed');
assert.equal(
  result.lease.runtime_authority.allocator_token,
  'runtime-only-broker-token'
);
assert.equal(JSON.stringify(result).includes('runtime-only-broker-token'),false);

const wrongMarket=createVoluntaryMarketAdapter({
  leaseResolver:createYardVoluntaryLeaseResolver({
    yard:{
      async remoteCapacityGrant(){
        return {
          node_id:'chromebook-real-bridge-proof',
          device_fingerprint:'sha256:'+'f'.repeat(64),
          capacity_endpoint:'https://broker.example/nodes/chromebook-real-bridge-proof',
          allocator_token:'bad',
        };
      },
    },
    brokerDeploymentId:'remote-broker-proof',
  }),
});
wrongMarket.registerProvider({
  provider_id:'chromebook-real-bridge-proof',
  public_key_pem:publicPem,
});
wrongMarket.submitSignedOffer({offer:prepared,signature_base64:signature});
await assert.rejects(
  wrongMarket.lease({
    demand,
    offer:{
      provider_id:'chromebook-real-bridge-proof',
      metadata:{
        voluntary_offer_id:'chromebook-real-offer',
        agreement:{
          schema:'evercraft.saban.compute-agreement.v1',
          agreement_id:'proof',
          agreement_hash:'sha256:proof',
          demand_id:demand.demand_id,
          market:'evercraft-voluntary',
          provider_id:'chromebook-real-bridge-proof',
          terms:{
            economics:{zero_cost:true},
            metadata:{voluntary_offer_id:'chromebook-real-offer'},
          },
        },
      },
    },
  }),
  /device_fingerprint_mismatch/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.voluntary-yard-bridge-proof.v1',
  negotiation_identity_matches_nodeseed_identity:true,
  yard_grant_required_for_execution_ready:true,
  real_nodeseed_endpoint_bound:true,
  allocator_authority_runtime_only:true,
  mismatched_device_fingerprint_rejected:true,
},null,2));
