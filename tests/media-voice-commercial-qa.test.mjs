import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SCHEMA, verifyReceipt} from '../systemia/media-studio/voice-commercial-qa.mjs';
const script=fileURLToPath(new URL('../systemia/media-studio/voice-commercial-qa.mjs',import.meta.url));

function sample(){
 const masters=Array.from({length:10},(_,i)=>({
   masterWav:'take-'+i+'.wav',previewMp3:'take-'+i+'.mp3',
   preset:i<8?'online_review':'us_tv_reference',
   verifiedMasterLufs:i<8?-16.2:-24.1,
   verifiedMasterTruePeakDbtp:i<8?-2.03:-4,
   sampleRate:48000,pcmBits:24,
   wavSha256:'a'.repeat(64),mp3Sha256:'b'.repeat(64),
 }));
 return {schema:SCHEMA,status:'technical_private_audition_not_production_approved',
   originalModelArtifactsModified:false,actorPerformanceChanged:false,phonemesChanged:false,
   licenseRightsVerified:false,founderFinalPerformanceAccepted:false,
   publicationAuthorized:false,endCustomerUseAuthorized:false,
   masters,sourceProofs:Array.from({length:4},(_,i)=>({source:'take-'+i+'.wav'}))};
}
test('private commercial finishing receipt validates without synthesizers',()=>{
 assert.equal(verifyReceipt(sample()),true);
 const r=spawnSync('node',[script,'--verify-only'],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/contract preflight OK/);
});
test('reject accidental rights or founder acceptance promotion',()=>{
 for(const k of ['licenseRightsVerified','founderFinalPerformanceAccepted','publicationAuthorized',
                  'endCustomerUseAuthorized']){
   const x=sample();x[k]=true;assert.throws(()=>verifyReceipt(x),/Unproven release approval/);
 }
});
test('reject sound engineering out of bounds and duplicates',()=>{
 const a=sample();a.masters[0].verifiedMasterLufs=-13;
 assert.throws(()=>verifyReceipt(a),/loudness tolerance/);
 const b=sample();b.masters[0].verifiedMasterTruePeakDbtp=-1;
 assert.throws(()=>verifyReceipt(b),/true-peak tolerance/);
 const c=sample();c.masters[1].masterWav=c.masters[0].masterWav;
 assert.throws(()=>verifyReceipt(c),/Duplicate mastered file/);
});
test('reject partial and inappropriate evidence status',()=>{
 const a=sample();a.masters.pop();assert.throws(()=>verifyReceipt(a),/exactly ten/);
 const b=sample();b.status='approved';assert.throws(()=>verifyReceipt(b),/Wrong evaluation status/);
 const c=sample();c.originalModelArtifactsModified=true;
 assert.throws(()=>verifyReceipt(c),/protected voice finishing trial/);
});
