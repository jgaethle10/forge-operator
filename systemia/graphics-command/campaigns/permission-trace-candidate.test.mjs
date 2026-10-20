import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareSystemiaMotionCandidate} from './permission-trace-candidate.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const handoff=JSON.parse(fs.readFileSync(path.join(here,'systemia-university-owned-handoff.v1.json'),'utf8'));
function fixture(){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-motion-gate-'));
  const assetPath=path.join(folder,'source.mp4');
  const bytes=Buffer.from('CI identity fixture; not a real movie');
  fs.writeFileSync(assetPath,bytes);
  const assetSha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const frameSha256=Object.fromEntries([0,24,48,72,96,119].map(i=>[i,crypto.createHash('sha256').update('frame-'+i).digest('hex')]));
  const receipt={
    schema:'evercraft.graphics-command.original-motion-candidate.v1',
    campaignId:handoff.campaignId,sceneId:'permission-trace',
    visualState:'original_software_render_synthetic_training_scene',
    rightsState:'original_source_authored_pending_human_review',
    nativeWorldEngineGpu:false,voicePresent:false,shotTournamentApproved:false,
    admittedIntoFallen:false,publicationAuthority:false,
    width:1280,height:720,fps:24,durationSec:5,frames:120,
    frameSha256,assetSha256,assetBytes:bytes.length
  };
  return {folder,assetPath,receipt};
}

test('makes a real-byte-bound, unapproved Fallen candidate without mutating the studio timeline',()=>{
  const {folder,assetPath,receipt}=fixture();
  try{
    const x=prepareSystemiaMotionCandidate({handoff,receipt,assetPath});
    assert.equal(x.candidate.shotId,handoff.campaignId+'-permission-trace');
    assert.equal(x.candidate.kind,'video');
    assert.equal(x.candidate.sourceState,'generated_visualization');
    assert.equal(x.candidate.observations.length,0);
    assert.equal(x.gate.productionNeedId,handoff.campaignId+'-permission-trace-visual');
    assert.equal(x.gate.state,'observer_candidate_only');
    assert.equal(x.gate.permissions.sourceAdmission,false);
    assert.equal(x.gate.permissions.publication,false);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('rejects swapped media, false authority and synthetic provenance laundering',()=>{
  const {folder,assetPath,receipt}=fixture();
  try{
    fs.appendFileSync(assetPath,'swapped');
    assert.throws(()=>prepareSystemiaMotionCandidate({handoff,receipt,assetPath}),/movie_byte_identity_mismatch/);
    fs.writeFileSync(assetPath,Buffer.from('CI identity fixture; not a real movie'));
    for(const field of ['voicePresent','shotTournamentApproved','nativeWorldEngineGpu','admittedIntoFallen','publicationAuthority']){
      const forged={...receipt,[field]:true};
      assert.throws(()=>prepareSystemiaMotionCandidate({handoff,receipt:forged,assetPath}),/false_claim_or_release/);
    }
    assert.throws(()=>prepareSystemiaMotionCandidate({handoff,receipt:{...receipt,sceneId:'different'},assetPath}),/receipt_wrong_scene/);
    assert.throws(()=>prepareSystemiaMotionCandidate({handoff,receipt:{...receipt,frameSha256:{...receipt.frameSha256,'119':receipt.frameSha256['0']}},assetPath}),/frame_diversity_not_proven/);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
