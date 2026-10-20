import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {produceDirectorStoryboard} from './director-storyboard.mjs';

const requestPath=process.env.DIRECTOR_STORYBOARD_TEST_REQUEST;
if(!requestPath)throw Error('director_storyboard_real_gpu_artifact_fixtures_required');
const base=JSON.parse(fs.readFileSync(requestPath,'utf8'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-director-test-'));
process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
let counter=0;
const dest=()=>path.join(root,'output-'+(++counter));
const wrong=request=>structuredClone(request);
test('fails closed if any original signed visual source is altered',()=>{
 const req=wrong(base);
 req.shots[1].sha256='0'.repeat(64);
 assert.throws(()=>produceDirectorStoryboard(req,dest()),/fallen_storyboard_source_sha256_mismatch_detail_closeup/);
});
test('will not silently reorder original directed camera films',()=>{
 const req=wrong(base);
 [req.shots[0],req.shots[1]]=[req.shots[1],req.shots[0]];
 assert.throws(()=>produceDirectorStoryboard(req,dest()),/fallen_storyboard_shot_order_invalid/);
});
test('does not invent, reenable or mix previously rejected synthetic sound',()=>{
 const req=wrong(base);
 req.audioPolicy='preserve';
 assert.throws(()=>produceDirectorStoryboard(req,dest()),/fallen_storyboard_audio_not_approved/);
});
test('rejects wrong scene rights/provenance receipt and missing director verification',()=>{
 const req=wrong(base);
 req.shots[0].receiptPath=req.shots[1].receiptPath;
 assert.throws(()=>produceDirectorStoryboard(req,dest()),/fallen_storyboard_signed_world_engine_source_invalid_hero_full/);
});
test('assembles actual signed 3D World Engine source frames into a new three-beat silent film',()=>{
 const req=wrong(base);
 const output=dest();
 const proof=produceDirectorStoryboard(req,output);
 assert.equal(proof.schema,'evercraft.fallen.director-storyboard-receipt.v1');
 assert.deepEqual(proof.editing.shotOrder,['hero_full','detail_closeup','title_safe']);
 assert.equal(proof.editing.transition,'ffmpeg_xfade');
 assert.equal(proof.inputProofs.length,3);
 assert.equal(proof.output.width,640);
 assert.equal(proof.output.height,360);
 assert.equal(proof.output.audio,false);
 assert.ok(proof.output.frames>=190);
 assert.ok(proof.output.frames<=202);
 assert.equal(proof.stills.length,3);
 assert.equal(proof.publicationAuthority,false);
 assert.equal(proof.clientApproval,false);
 assert.equal(proof.creativeApproval,false);
 assert.equal(proof.inputProofs.every(p=>p.worldDigest===proof.inputProofs[0].worldDigest),true);
 assert.ok(fs.statSync(path.join(output,proof.output.file)).size>30000);
 assert.ok(fs.statSync(path.join(output,'receipt.json')).size>1400);
});
