import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessStudioMaster } from './master-qc.js';
import {
  compileLongformPlan,
  renderLongformPlan,
  type LongformProjectInput,
  type LongformSceneMaster,
} from './longform-checkpoints.js';

function run(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function makeScene(root:string,id:string,order:number,actId:string,frequency:number):LongformSceneMaster{
  const file=path.join(root,id+'.mp4');
  run([
    '-y','-v','error',
    '-f','lavfi','-i',`testsrc2=size=640x360:rate=30`,
    '-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000`,
    '-t','1',
    '-c:v','libx264','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k',
    '-shortest',file
  ]);
  const qc=assessStudioMaster({
    filePath:file,
    policy:{expectedDurationSec:1,minShortEdge:360,maxFreezeRatio:.6}
  });
  assert.equal(qc.status,'accepted');
  return {
    sceneId:id,actId,order,path:file,sha256:sha(file),durationSec:qc.measurements.durationSec,
    continuityDigest:'continuity-'+id,masterQc:qc
  };
}

test('renders verified scenes into resumable act and master checkpoints',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-longform-'));
  const scenes=[
    makeScene(root,'scene-1',0,'act-1',330),
    makeScene(root,'scene-2',1,'act-1',440),
    makeScene(root,'scene-3',2,'act-2',550),
  ];
  const project:LongformProjectInput={
    schema:'evercraft.fallen.longform-project.v1',
    id:'feature-test',title:'Feature Test',scenes
  };
  const plan=compileLongformPlan(project);
  assert.equal(plan.acts.length,2);
  assert.equal(plan.boundaries.noSceneRegenerationAuthority,true);

  const first=renderLongformPlan({plan,outputDir:path.join(root,'render')});
  assert.equal(first.renderedActCount,2);
  assert.equal(first.reusedActCount,0);
  assert.ok(fs.statSync(first.outputPath).size>1000);

  const second=renderLongformPlan({plan,outputDir:path.join(root,'render')});
  assert.equal(second.reusedActCount,2);
  assert.equal(second.renderedActCount,0);
  assert.equal(second.masterCheckpoint.state,'reused');
  assert.equal(second.outputSha256,first.outputSha256);
});

test('changed scene bytes invalidate the trusted scene before any resume can reuse them',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-longform-tamper-'));
  const scene=makeScene(root,'scene-1',0,'act-1',330);
  fs.appendFileSync(scene.path,Buffer.from('tamper'));
  const project:LongformProjectInput={
    schema:'evercraft.fallen.longform-project.v1',
    id:'tamper-test',title:'Tamper',scenes:[scene]
  };
  assert.throws(()=>compileLongformPlan(project),/longform_scene_digest_mismatch:scene-1/);
});

test('scene masters with mismatched technical formats cannot be stream-copied into one act',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-longform-format-'));
  const a=makeScene(root,'a',0,'act-1',330);
  const b=makeScene(root,'b',1,'act-1',440);
  b.masterQc.measurements.width=1280;
  const project:LongformProjectInput={
    schema:'evercraft.fallen.longform-project.v1',
    id:'format-test',title:'Format',scenes:[a,b]
  };
  assert.throws(()=>compileLongformPlan(project),/longform_scene_technical_format_mismatch:b/);
});

test('acts must be contiguous so resume lineage cannot hide a reordered story',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-longform-acts-'));
  const scenes=[
    makeScene(root,'a',0,'act-1',330),
    makeScene(root,'b',1,'act-2',440),
    makeScene(root,'c',2,'act-1',550),
  ];
  const project:LongformProjectInput={
    schema:'evercraft.fallen.longform-project.v1',
    id:'act-test',title:'Acts',scenes
  };
  assert.throws(()=>compileLongformPlan(project),/longform_act_not_contiguous:act-1/);
});
