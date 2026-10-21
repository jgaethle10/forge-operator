import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFilmPlan } from './director.js';
import { renderFilm } from './render.js';
import { assertCinematicCoverageForRender } from './cinematic-coverage.js';
import type { MediaProject } from './types.js';

function relayProject():MediaProject{
  return {
    id:'relay-cinematic-benchmark',
    title:'Relay - The Gap',
    brief:{
      prompt:'A realistic commercial: two executives leave the same meeting, misunderstand the permit date, and clarify before the crew arrives. This is a concept demonstration.',
      format:'commercial',
      durationSec:30,
      aspectRatio:'9:16',
      cta:'Relay. Clarity before consequences.',
      cinematicCoverage:{
        schema:'evercraft.fallen.cinematic-coverage-contract.v1',
        shots:[
          {
            id:'meeting-exit',
            beat:'hook',
            subject:'Two people leave an actual meeting',
            action:'Both stand, exchange goodbyes, gather materials and walk through the doorway',
            mode:'physical_action',
            candidateAssetIds:[],
            minDurationSec:3,
          },
          {
            id:'different-plans',
            beat:'setup',
            subject:'Two separate conflicting project preparations',
            action:'One manager marks construction start while the other prepares the permit submission',
            mode:'physical_action',
            candidateAssetIds:[],
            minDurationSec:3,
          },
        ],
      },
    },
    assets:[
      {id:'concept-frame',path:'./concept-frame.jpg',kind:'image',rights:'owned',tags:['meeting','brand']},
    ],
  };
}

test('Relay stills cannot substitute for the meeting-exit or permit-prep actions',()=>{
  const plan=compileFilmPlan(relayProject());
  assert.equal(plan.cinematicCoverage?.status,'blocked');
  assert.equal(plan.cinematicCoverage?.items.length,2);
  assert.deepEqual(plan.cinematicCoverage?.items.map(x=>x.state),['missing','missing']);
  assert.equal(plan.generationRequests.filter(x=>x.id.startsWith('gen-cinematic-')).length,2);
  assert.ok(plan.generationRequests.some(x=>x.prompt.includes('No still image zoom')));
  assert.throws(()=>assertCinematicCoverageForRender(plan),/cinematic_coverage_unresolved/);
});

test('renderFilm rejects unresolved cinematic coverage before touching FFmpeg',()=>{
  const plan=compileFilmPlan(relayProject());
  assert.throws(()=>renderFilm(plan,'/tmp/relay-bad-placeholder.mp4'),/cinematic_coverage_unresolved/);
});

test('a video with unknown rights cannot satisfy cinematic admission',()=>{
  const project=relayProject();
  project.assets.push({id:'exiting',path:'./exiting.mp4',kind:'video',durationSec:7,rights:'unknown'});
  project.brief.cinematicCoverage!.shots[0].candidateAssetIds=['exiting'];
  assert.equal(compileFilmPlan(project).cinematicCoverage?.status,'blocked');
});

test('missing mandatory shot duration blocks an otherwise eligible clip',()=>{
  const project=relayProject();
  project.assets.push({id:'exiting',path:'./exiting.mp4',kind:'video',durationSec:1,rights:'owned'});
  project.brief.cinematicCoverage!.shots[0].candidateAssetIds=['exiting'];
  assert.equal(compileFilmPlan(project).cinematicCoverage?.items[0].state,'missing');
});

test('bound licensed or owned video reaches candidate-only status, never creative approval',()=>{
  const project=relayProject();
  project.assets.push(
    {id:'exiting',path:'./exiting.mp4',kind:'video',durationSec:8,rights:'owned',tags:['meeting exit']},
    {id:'permits',path:'./permits.mp4',kind:'video',durationSec:8,rights:'licensed',tags:['construction permits']},
  );
  project.brief.cinematicCoverage!.shots[0].candidateAssetIds=['exiting'];
  project.brief.cinematicCoverage!.shots[1].candidateAssetIds=['permits'];
  const plan=compileFilmPlan(project);
  assert.equal(plan.cinematicCoverage?.status,'candidate_bound_unverified');
  assert.equal(plan.scenes[0].assetId,'exiting');
  assert.equal(plan.scenes[1].assetId,'permits');
  assert.equal(plan.cinematicCoverage?.boundaries.creativeReviewRequired,true);
  assert.equal(plan.cinematicCoverage?.boundaries.publicationAuthority,false);
  assert.doesNotThrow(()=>assertCinematicCoverageForRender(plan));
});

test('tampering with a scene or receipt cannot bypass cinematic render admission',()=>{
  const project=relayProject();
  project.assets.push(
    {id:'exiting',path:'./exiting.mp4',kind:'video',durationSec:8,rights:'owned'},
    {id:'permits',path:'./permits.mp4',kind:'video',durationSec:8,rights:'licensed'},
  );
  project.brief.cinematicCoverage!.shots[0].candidateAssetIds=['exiting'];
  project.brief.cinematicCoverage!.shots[1].candidateAssetIds=['permits'];
  const plan=compileFilmPlan(project);
  const replacement={...plan,scenes:plan.scenes.map(s=>s.id==='scene-1'?{...s,mediaKind:'image' as const}:s)};
  assert.throws(()=>assertCinematicCoverageForRender(replacement),/cinematic_coverage_binding_invalid/);
  const shortened={...plan,scenes:plan.scenes.map(s=>s.id==='scene-1'?{...s,durationSec:.1}:s)};
  assert.throws(()=>assertCinematicCoverageForRender(shortened),/cinematic_coverage_binding_invalid/);
});
