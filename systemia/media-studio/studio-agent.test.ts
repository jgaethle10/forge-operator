import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioAgentContext,
  executeStudioAgentPlan,
  type StudioAgentPlan,
} from './studio-agent.js';
import { makeTimelineProject } from './timeline.js';

function project(){
  return makeTimelineProject({
    id:'week-in-motion',
    title:'Week in Motion',
    aspectRatio:'16:9',
    assets:[
      {
        id:'systemia-v1',
        path:'/tmp/systemia-v1.mp4',
        digest:'a'.repeat(64),
        kind:'video',
        sourceRefs:['product:systemia'],
        continuityDigest:'continuity-systemia'
      },
      {
        id:'systemia-alt',
        path:'/tmp/systemia-alt.mp4',
        digest:'b'.repeat(64),
        kind:'video',
        sourceRefs:['tournament:prior-winner'],
        continuityDigest:'continuity-systemia'
      }
    ],
    tracks:[{
      id:'picture',
      kind:'video',
      name:'Picture',
      clips:[
        {
          id:'systemia-shot',
          trackId:'picture',
          assetId:'systemia-v1',
          startSec:10,
          durationSec:6,
          label:'Systemia walkthrough'
        }
      ]
    }]
  });
}

function plan(operations:StudioAgentPlan['operations']):StudioAgentPlan{
  return {
    schema:'evercraft.fallen.studio-agent-plan.v1',
    projectId:'week-in-motion',
    expectedVersion:1,
    instruction:'Make the Systemia moment more cinematic without changing the rest of the edit.',
    operations,
    boundaries:{
      publicationAuthorityGranted:false,
      paidGenerationAuthorityGranted:false,
      destructiveProjectRewriteForbidden:true,
      lockedTracksRespected:true,
    },
  };
}

test('context gives a planner bounded edit state instead of raw project rewrite authority',()=>{
  const ctx=buildStudioAgentContext(project(),'Make Systemia more cinematic.');
  assert.equal(ctx.projectVersion,1);
  assert.equal(ctx.tracks[0].clips[0].id,'systemia-shot');
  assert.equal(ctx.allowedOperations.includes('regenerate_clip'),true);
  assert.ok(ctx.plannerRules.some(rule=>rule.includes('Never rewrite')));
});

test('regenerate instruction creates candidate work without mutating the timeline',()=>{
  const result=executeStudioAgentPlan({
    project:project(),
    plan:plan([{
      type:'regenerate_clip',
      clipId:'systemia-shot',
      instruction:'Follow the founder through the doorway, then rack focus to the live Systemia wall.',
      candidateCount:4,
    }])
  });
  assert.equal(result.status,'needs_generation');
  assert.equal(result.project.version,1);
  assert.equal(result.mutationReceipts.length,0);
  assert.equal(result.generationNeeds.length,1);
  assert.equal(result.generationNeeds[0].requiresTournament,true);
  assert.equal(result.generationNeeds[0].directTimelineMutationAllowed,false);
  assert.equal(result.generationNeeds[0].sourceAsset.digest,'a'.repeat(64));
});

test('bounded local edits preserve the rest of the timeline and version every mutation',()=>{
  const result=executeStudioAgentPlan({
    project:project(),
    plan:plan([
      {type:'move_clip',clipId:'systemia-shot',startSec:11},
      {type:'trim_clip',clipId:'systemia-shot',durationSec:5.5,trimStartSec:.25},
    ])
  });
  assert.equal(result.status,'completed');
  assert.equal(result.project.version,3);
  assert.equal(result.mutationReceipts.length,2);
  const clip=result.project.tracks[0].clips[0];
  assert.equal(clip.startSec,11);
  assert.equal(clip.durationSec,5.5);
});

test('existing admitted asset can replace one clip without regenerating anything',()=>{
  const result=executeStudioAgentPlan({
    project:project(),
    plan:plan([{type:'replace_with_existing_asset',clipId:'systemia-shot',assetId:'systemia-alt'}])
  });
  assert.equal(result.status,'completed');
  assert.equal(result.generationNeeds.length,0);
  assert.equal(result.project.tracks[0].clips[0].assetId,'systemia-alt');
});

test('locked clips fail closed',()=>{
  const p=project();
  p.tracks[0].clips[0].locked=true;
  const result=executeStudioAgentPlan({
    project:p,
    plan:plan([{type:'trim_clip',clipId:'systemia-shot',durationSec:4}])
  });
  assert.equal(result.status,'blocked');
  assert.ok(result.reasons.includes('clip_locked:systemia-shot'));
  assert.equal(result.project.version,1);
});

test('agent proposal cannot smuggle publication or paid-generation authority',()=>{
  const bad=plan([{type:'regenerate_clip',clipId:'systemia-shot',instruction:'Try again'}]) as any;
  bad.boundaries.publicationAuthorityGranted=true;
  bad.boundaries.paidGenerationAuthorityGranted=true;
  const result=executeStudioAgentPlan({project:project(),plan:bad});
  assert.equal(result.status,'blocked');
  assert.ok(result.reasons.includes('publication_authority_must_remain_false'));
  assert.ok(result.reasons.includes('paid_generation_authority_must_remain_false'));
});
