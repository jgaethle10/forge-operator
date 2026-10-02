import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import { buildWorldForgeCinematicShot } from './world-forge-cinematic.js';

test('World Forge cinematic shot binds exact world and camera state',()=>{
  const project=createWorldForgeStarterProject();
  project.renderIntents[0]={
    ...project.renderIntents[0],
    startFrame:1,
    endFrame:90,
    fps:30,
  };

  const shot=buildWorldForgeCinematicShot({
    project,
    renderIntentId:'preview',
    shotId:'shot-001',
  });

  assert.equal(shot.id,'shot-001');
  assert.equal(shot.projectId,project.id);
  assert.equal(shot.projectVersion,project.version);
  assert.equal(shot.durationSec,3);
  assert.equal(shot.cameraNodeId,'camera-main');
  assert.equal(shot.continuity.worldDigest,shot.projectDigest);
  assert.equal(shot.downstream.requiresRenderReceipt,true);
  assert.equal(shot.downstream.requiresShotTournament,true);
  assert.equal(shot.downstream.directTimelineMutationAllowed,false);
  assert.equal(shot.downstream.directPublicationAuthority,false);
  assert.match(shot.digest,/^[a-f0-9]{64}$/);
});

test('World Forge cinematic shot fails closed when intent camera is invalid',()=>{
  const project=createWorldForgeStarterProject();
  project.renderIntents[0].cameraNodeId='hero-core';

  assert.throws(
    ()=>buildWorldForgeCinematicShot({
      project,
      renderIntentId:'preview',
      shotId:'shot-bad',
    }),
    /world_forge_cinematic_project_invalid/,
  );
});
