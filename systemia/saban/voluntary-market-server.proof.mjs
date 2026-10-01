import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  createVoluntaryMarketAdapter,
  prepareVoluntaryOffer,
  canonicalVoluntaryOffer,
} from './markets/voluntary.mjs';
import { startVoluntaryMarketServer } from './voluntary-market-server.mjs';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from './compute-exchange.mjs';

const market=createVoluntaryMarketAdapter({maxRounds:6});
const server=await startVoluntaryMarketServer({
  market,
  host:'127.0.0.1',
  port:0,
  registrationToken:'registration-proof',
});

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});

try{
  const registration=await fetch(server.url+'/v1/providers/register',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-evercraft-registration-token':'registration-proof',
    },
    body:JSON.stringify({
      provider_id:'remote-laptop-proof',
      public_key_pem:publicPem,
    }),
  }).then((r)=>r.json());

  assert.equal(registration.schema,'evercraft.saban.voluntary-provider-registration.v1');
  assert.ok(registration.provider_token);

  const prepared=prepareVoluntaryOffer({
    provider_id:'remote-laptop-proof',
    offer_id:'remote-laptop-night-shift',
    resources:{
      cpu_units:8,
      memory_mb:16384,
      storage_gb:80,
      gpu_count:0,
      gpu_models:[],
    },
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{
      zero_cost:false,
      hourly_usd:0.15,
      minimum_hourly_usd:0.06,
    },
    placement:{
      public_ingress:false,
      persistent_storage:false,
    },
    trust:{
      uptime_7d:0.98,
      valid_version:true,
    },
    execution:{
      transport:'evercraft-nodeseed',
      endpoint:'https://broker.example/nodes/remote-laptop-proof',
    },
    available_until:new Date(Date.now()+10*60_000).toISOString(),
    nonce:'remote-offer-proof-1',
  });
  const signature=sign(
    null,
    Buffer.from(canonicalVoluntaryOffer(prepared)),
    privateKey
  ).toString('base64');

  const admitted=await fetch(server.url+'/v1/offers',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+registration.provider_token,
      'x-evercraft-provider-id':'remote-laptop-proof',
    },
    body:JSON.stringify({
      offer:prepared,
      signature_base64:signature,
    }),
  }).then((r)=>r.json());
  assert.equal(admitted.ok,true);
  assert.equal(admitted.admission.signature_verified,true);

  const agent=(async()=>{
    const next=await fetch(
      server.url+'/v1/proposals?provider_id=remote-laptop-proof&wait_ms=5000',
      {
        headers:{
          authorization:'Bearer '+registration.provider_token,
        },
      }
    ).then((r)=>r.json());
    assert.ok(next.proposal);
    assert.equal(next.proposal.payload.proposal.issuer,'requestor');
    assert.equal(
      next.proposal.payload.proposal.terms.economics.hourly_usd,
      0.08
    );

    const response=await fetch(
      server.url+'/v1/proposals/'+encodeURIComponent(
        next.proposal.proposal_request_id
      )+'/respond?provider_id=remote-laptop-proof',
      {
        method:'POST',
        headers:{
          'content-type':'application/json',
          authorization:'Bearer '+registration.provider_token,
        },
        body:JSON.stringify({
          decision:{action:'accept'},
        }),
      }
    );
    assert.equal(response.status,200);
  })();

  const demand=normalizeComputeDemand({
    demand_id:'remote-voluntary-proof',
    workload_class:'saban.multiplier-assignment.v1',
    cpu_units:2,
    memory_mb:2048,
    storage_gb:5,
    duration_seconds:3600,
    negotiation_level:'quote',
    max_hourly_usd:0.08,
    max_total_usd:0.08,
  });

  const negotiation=await negotiateCompute({
    demand,
    adapters:[market],
    quoteAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:demand.demand_id,
      allowed_markets:['evercraft-voluntary'],
    },
  });
  await agent;

  assert.equal(negotiation.selected_offer.provider_id,'remote-laptop-proof');
  assert.equal(negotiation.selected_offer.economics.hourly_usd,0.08);
  assert.ok(negotiation.events.some((e)=>e.type==='quote.received'));
  assert.equal(negotiation.lease,null);

  const revoke=await fetch(
    server.url+'/v1/offers/remote-laptop-night-shift?provider_id=remote-laptop-proof',
    {
      method:'DELETE',
      headers:{
        authorization:'Bearer '+registration.provider_token,
      },
    }
  ).then((r)=>r.json());
  assert.equal(revoke.ok,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.voluntary-market-server-proof.v1',
    remote_provider_registered:true,
    provider_key_offer_signature_verified:true,
    saban_counter_delivered_over_http:true,
    provider_acceptance_returned_over_http:true,
    mutually_accepted_hourly_usd:0.08,
    immediate_remote_revocation:true,
    execution_authority_not_inferred:true,
  },null,2));
}finally{
  await server.close();
}
