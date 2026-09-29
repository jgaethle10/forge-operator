import assert from 'node:assert/strict';
import test from 'node:test';
import { executeProductionRoutes, type ProductionProviderAdapter } from './production-provider-runtime.js';
import type { ProductionNeed } from './types.js';

const need:ProductionNeed={
  id:'speech-1',
  kind:'speech',
  prompt:'A concise narration line.',
  durationSec:3,
  voiceProfileId:'host-v1',
  continuityDigest:'continuity',
  requires:['voice_profile','commercial_rights','provenance_receipt','timing_control'],
  status:'planned',
};

function adapter(commercialRights:'allowed'|'unknown'='allowed'):ProductionProviderAdapter{
  return {
    id:'voice-adapter',
    departmentId:'voice-dept',
    verified:true,
    supports:['speech'],
    async execute(input){
      return {
        artifact:{
          path:'/tmp/voice.mp3',
          digest:'a'.repeat(64),
          kind:'audio',
          durationSec:3,
        },
        receipt:{
          schema:'evercraft.fallen.production-receipt.v1',
          needId:input.id,
          departmentId:'voice-dept',
          continuityDigest:input.continuityDigest,
          artifactDigest:'a'.repeat(64),
          commercialRights,
          provenance:'complete',
          voiceProfileId:input.voiceProfileId,
          durationSec:3,
          generatedAt:'2026-09-29T00:00:00Z',
        },
        sourceRefs:['provider:test'],
      };
    },
  };
}

test('executes only the verified adapter bound to the routed department and admits the output',async()=>{
  const result=await executeProductionRoutes({
    needs:[need],
    routes:[{needId:need.id,status:'routed',departmentId:'voice-dept',reason:'verified'}],
    adapters:[adapter()],
  });
  assert.equal(result.status,'completed');
  assert.equal(result.items[0].status,'completed');
  assert.equal(result.items[0].admission?.status,'accepted');
  assert.equal(result.boundaries.productionAdmissionEnforced,true);
  assert.equal(result.boundaries.visualJobsRemainInVisualFabric,true);
});

test('provider output that fails production admission cannot advance',async()=>{
  const result=await executeProductionRoutes({
    needs:[need],
    routes:[{needId:need.id,status:'routed',departmentId:'voice-dept',reason:'verified'}],
    adapters:[adapter('unknown')],
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.items[0].status,'failed');
  assert.equal(result.items[0].admission?.status,'rejected');
  assert.match(result.items[0].error??'',/production_admission_rejected/);
});

test('unverified adapters are unavailable even if supplied by the caller',async()=>{
  const unverified={...adapter(),verified:false};
  const result=await executeProductionRoutes({
    needs:[need],
    routes:[{needId:need.id,status:'routed',departmentId:'voice-dept',reason:'verified'}],
    adapters:[unverified],
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.items[0].error,'verified_production_adapter_missing');
});


test('visual production is rejected from this runtime so Shot Tournament cannot be bypassed',async()=>{
  const visual:ProductionNeed={
    id:'video-1',
    kind:'video',
    prompt:'A generated visual.',
    durationSec:4,
    aspectRatio:'16:9',
    continuityDigest:'continuity',
    requires:['commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  const result=await executeProductionRoutes({
    needs:[visual],
    routes:[{needId:visual.id,status:'routed',departmentId:'voice-dept',reason:'not actually valid'}],
    adapters:[adapter()],
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.items[0].error,'visual_production_requires_visual_model_fabric');
});
