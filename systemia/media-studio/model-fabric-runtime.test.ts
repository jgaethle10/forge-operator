import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  executeVisualModelPlan,
  type VisualModelAdapter,
} from './model-fabric-runtime.js';
import type { VisualModelPlan } from './model-fabric.js';

const hex=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');

const plan:VisualModelPlan={
  schema:'evercraft.fallen.visual-model-plan.v1',
  requestId:'req-1',
  status:'routed',
  eligibleModels:['a','b'],
  rejectedModels:[],
  jobs:[
    {
      schema:'evercraft.fallen.visual-model-job.v1',
      id:'req-1-candidate-01',
      requestId:'req-1',
      needId:'need-1',
      modelId:'a',
      providerId:'pa',
      task:'video',
      prompt:'cinematic HQ',
      aspectRatio:'16:9',
      continuityDigest:'cont',
      requires:['commercial_rights','provenance_receipt'],
      references:[],
      outputContract:{
        commercialRightsRequired:true,
        provenanceRequired:true,
        artifactDigestRequired:true,
        tournamentCandidateRequired:true
      }
    },
    {
      schema:'evercraft.fallen.visual-model-job.v1',
      id:'req-1-candidate-02',
      requestId:'req-1',
      needId:'need-1',
      modelId:'b',
      providerId:'pb',
      task:'video',
      prompt:'cinematic HQ',
      aspectRatio:'16:9',
      continuityDigest:'cont',
      requires:['commercial_rights','provenance_receipt'],
      references:[],
      outputContract:{
        commercialRightsRequired:true,
        provenanceRequired:true,
        artifactDigestRequired:true,
        tournamentCandidateRequired:true
      }
    }
  ],
  boundaries:{
    verifiedExecutionOnly:true,
    referenceIdentityFailsClosed:true,
    providerDiversityPreferred:true,
    tournamentSelectionRequired:true,
    directPublicationAuthority:false
  },
  digest:'digest',
  createdAt:'2026-09-28T00:00:00Z'
};

function adapter(modelId:string,providerId:string,fail=false):VisualModelAdapter{
  return {
    id:`adapter-${modelId}`,
    modelId,
    providerId,
    verified:true,
    async execute(job){
      if(fail) throw new Error('provider_failed');
      return {
        schema:'evercraft.fallen.visual-execution-receipt.v1',
        jobId:job.id,
        requestId:job.requestId,
        needId:job.needId,
        modelId,
        providerId,
        providerRequestId:`provider-${job.id}`,
        artifact:{
          path:`/tmp/${job.id}.mp4`,
          digest:hex(job.id),
          mimeType:'video/mp4',
          durationSec:8
        },
        commercialRights:'allowed',
        provenance:'complete',
        continuityDigest:job.continuityDigest,
        sourceRefs:['test:adapter'],
        generatedAt:'2026-09-28T00:00:00Z'
      };
    }
  };
}

test('executes candidate fanout through model-bound verified adapters',async()=>{
  const result=await executeVisualModelPlan(plan,[adapter('a','pa'),adapter('b','pb')]);
  assert.equal(result.status,'completed');
  assert.equal(result.completed.length,2);
  assert.equal(result.failed.length,0);
  assert.equal(result.boundaries.publicationAuthorityGranted,false);
});

test('preserves successful candidates when another provider fails',async()=>{
  const result=await executeVisualModelPlan(plan,[adapter('a','pa'),adapter('b','pb',true)]);
  assert.equal(result.status,'partial');
  assert.equal(result.completed.length,1);
  assert.equal(result.failed.length,1);
  assert.equal(result.failed[0].modelId,'b');
});

test('unverified or missing adapters cannot execute jobs',async()=>{
  const bad=adapter('a','pa');
  bad.verified=false;
  const result=await executeVisualModelPlan(plan,[bad]);
  assert.equal(result.status,'blocked');
  assert.equal(result.completed.length,0);
  assert.equal(result.failed.length,2);
});
