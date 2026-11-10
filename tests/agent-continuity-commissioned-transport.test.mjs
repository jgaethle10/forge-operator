import test from "node:test";
import assert from "node:assert/strict";
import { createHttpInferenceAdapter } from "../systemia/raven/team-review-runtime.mjs";

const digest="sha256:"+"a".repeat(64);
const binding={
  request_id:"owned-request:commercial",
  role:"commercial",
  prompt:"Analyze a bounded internal packet.",
  agent_id:"raven-agent-immutable-13",
  mission_key:"mission-300",
  work_key:"work-3",
  preflight_id:"preflight-300",
  registry_snapshot_hash:digest,
};

test("commissioned transport routes to identity-addressed owned worker endpoint, never generic endpoint",async()=>{
  const requests=[];
  const adapter=createHttpInferenceAdapter({
    origin:"http://127.0.0.1:4322",
    token:"synthetic-owned-test-token-1234567890",
    fetchImpl:async(url,opts)=>{
      const body=JSON.parse(opts.body);
      requests.push({url,body});
      return {
        ok:true,status:200,
        async json(){return {
          status:"completed",text:"HOLD: need evidence",
          provider:"synthetic-owned-worker-gateway",
          provider_receipt:"synthetic-node:receipt-1",
        };},
      };
    },
  });
  const result=await adapter.inferCommissioned(binding);
  assert.equal(result.provider_receipt,"synthetic-node:receipt-1");
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,"http://127.0.0.1:4322/v1/commissioned/infer");
  assert.equal(requests[0].body.schema,"evercraft.raven.commissioned-inference.request.v1");
  assert.equal(requests[0].body.agent_id,binding.agent_id);
  assert.equal(requests[0].body.registry_snapshot_hash,digest);
  assert.equal(requests[0].body.preflight_id,binding.preflight_id);
  assert.equal(requests[0].body.mission_key,binding.mission_key);
  assert.equal(requests[0].body.reviewer_id,"commercial");
  assert.equal(requests[0].body.constraints.no_external_actions,true);
  await adapter.infer({request_id:"generic:1",role:"risk",prompt:"Review"});
  assert.equal(requests[1].url,"http://127.0.0.1:4322/v1/infer");
  assert.equal(requests[1].body.schema,"evercraft.raven.inference.request.v1");
  assert.equal(Object.hasOwn(requests[1].body,"agent_id"),false);
});
test("commissioned route fails before network request when role, registry or permission binding absent",async()=>{
  let calls=0;
  const adapter=createHttpInferenceAdapter({
    origin:"http://127.0.0.1:4322",
    token:"synthetic-owned-test-token-1234567890",
    fetchImpl:async()=>{calls+=1;throw Error("must not connect");},
  });
  for(const patch of [
    {agent_id:""},
    {agent_id:"juniper"},
    {agent_id:"sentinel"},
    {registry_snapshot_hash:"sha256:unverified"},
    {preflight_id:""},
    {mission_key:""},
  ]){
    await assert.rejects(()=>adapter.inferCommissioned({...binding,...patch}),/raven_commissioned_identity_or_mission_binding_invalid/);
  }
  assert.equal(calls,0);
});
test("commissioned inference does not fall back to normal prompt endpoint when owner gateway rejects role dispatch",async()=>{
  const urls=[];
  const adapter=createHttpInferenceAdapter({
    origin:"http://127.0.0.1:4322",
    token:"synthetic-owned-test-token-1234567890",
    fetchImpl:async(url)=>{
      urls.push(url);
      return {ok:false,status:404,async json(){return {status:"failed",error:"worker_not_enrolled"};}};
    },
  });
  await assert.rejects(()=>adapter.inferCommissioned(binding),/worker_not_enrolled/);
  assert.deepEqual(urls,["http://127.0.0.1:4322/v1/commissioned/infer"]);
});
