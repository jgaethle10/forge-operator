import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {associateSpatialFrames,temporalReviewPacket,worldsTemporalPreview,
  forensiScopeTemporalEvents,everMapsTemporalDrafts} from '../public/worlds/spatial-temporal.mjs';

const python = `
import importlib.util
import json
from pathlib import Path
path=Path('systemia/spatial-perception/offline_stereo.py')
spec=importlib.util.spec_from_file_location('evercraft_offline',path)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
events=[]
for i in range(3):
    frame='stereo-'+str(i).zfill(8)
    obs=mod.observation(frame,i*100,0,'car',0.93,(20+i*2,20,25,16),4,120,0.12,'a'*64,160,100)
    events.append({'frameId':frame,'timestampMs':i*100,'width':160,'height':100,'observations':[obs]})
print(json.dumps({'frames':events}))
`;

test('Python offline output is accepted by actual V2 temporal tracker and three consumers',()=>{
 const result=spawnSync('python3',['-c',python],{encoding:'utf8',timeout:6000});
 assert.equal(result.status,0,result.stderr);
 const frames=JSON.parse(result.stdout).frames;
 assert.equal(frames[0].observations[0].depthEstimateM,3.6);
 const timeline=associateSpatialFrames(frames);
 assert.equal(timeline.tracks.length,1);
 assert.equal(timeline.tracks[0].observationCount,3);
 const review=temporalReviewPacket(timeline);
 assert.equal(review.events.length,3);
 assert.equal(review.reviewStatus,'unreviewed');
 assert.equal(review.sourceMediaVerified,false);
 assert.equal(review.physicalSpeedMps,null);
 assert.equal(worldsTemporalPreview(timeline,'stereo-00000002').entities[0].collider,undefined);
 assert.equal(forensiScopeTemporalEvents(timeline)[0].reviewStatus,'requires_human_review');
 assert.equal(everMapsTemporalDrafts(timeline)[0].geometry,null);
});

test('Python no-disparity observation is preserved as unknown depth by tracker',()=>{
 const modified=python.replace('),4,120,0.12', '),None,120,0.12');
 const result=spawnSync('python3',['-c',modified],{encoding:'utf8',timeout:6000});
 assert.equal(result.status,0,result.stderr);
 const frames=JSON.parse(result.stdout).frames;
 assert.equal(frames[0].observations[0].depthEstimateM,null);
 const timeline=associateSpatialFrames(frames);
 assert.equal(worldsTemporalPreview(timeline,'stereo-00000000').entities.length,0);
 assert.equal(timeline.frames[0].events[0].cameraPositionM,null);
});
