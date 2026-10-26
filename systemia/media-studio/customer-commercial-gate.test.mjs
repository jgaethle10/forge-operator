import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {assembleCustomerCommercialGate,runCustomerCommercialGate} from './customer-commercial-gate.mjs';

const SHA='a'.repeat(64);
const request={
  schema:'evercraft.fallen.client-commercial-gate-request.v1',
  order:{id:'example-001',scopeConfirmed:true,aspectRatio:'9:16',
    expectedDurationSec:30,channels:['facebook'],includesNarration:false},
  storyboard:{beats:[{id:'hook',role:'hook',durationSec:5,purpose:'subject first'},
    {id:'value',role:'body',durationSec:20,purpose:'show work'},
    {id:'cta',role:'cta',durationSec:5,purpose:'tell viewer where to go'}]},
  rights:[],
  productionGrade:{schema:'evercraft.fallen.production-grade-report.v1',status:'rejected',beatReports:[]},
  creativeReview:{reviewedBy:'director',reviewedAt:'2026-10-25T16:30Z',checks:{}},
  clientApproval:{status:'pending'},
};
const renderReceipt={
  schema:'evercraft.fallen.timeline-export-receipt.v1',sha256:SHA,
  width:1080,height:1920,fps:30,durationSec:30,videoCodec:'h264',audioCodec:'aac',
  inputAssetIds:['product','music'],
};
const masterQc={
  schema:'evercraft.fallen.master-qc-receipt.v1',status:'accepted',sha256:SHA,
  measurements:{width:1080,height:1920,durationSec:30},
};
const clipManifest={schema:'evercraft.clip.media-intake.v1',media:{sha256:SHA}};
const audioQc={
  schema:'evercraft.fallen.commercial-audio-qc.v1',status:'accepted',sha256:SHA,
  measurements:{streamCount:1,integratedLufs:-16,truePeakDbtp:-1.5},
};
const visualQc={
  schema:'evercraft.fallen.commercial-visual-qc.v1',status:'accepted',masterSha256:SHA,
  durationSec:30,sampledFrames:120,segments:[
    {beatId:'hook',startSec:0,endSec:5,sampleCount:19,flags:[]},
    {beatId:'value',startSec:5,endSec:25,sampleCount:79,flags:[]},
    {beatId:'cta',startSec:25,endSec:30,sampleCount:19,flags:[]},
  ],
};
function assemble(overrides={}) {
  return assembleCustomerCommercialGate({
    request,renderReceipt,masterQc,clipManifest,audioQc,visualQc,...overrides,
  });
}
test('single customer gate assembles all quality receipts with no shipping authority',()=>{
  const r=assemble();
  assert.equal(r.schema,'evercraft.fallen.customer-commercial-gate-report.v1');
  assert.equal(r.status,'blocked'); // missing real rights, actual creative and production approval
  assert.equal(r.masterSha256,SHA);
  assert.equal(r.audioStatus,'accepted');
  assert.equal(r.pictureStatus,'accepted');
  assert.equal(r.boundaries.deliveryAuthorityGranted,false);
  assert.equal(r.boundaries.paymentAuthorityGranted,false);
  assert.equal(r.boundaries.publicationAuthorityGranted,false);
});
test('a forged clean audio receipt referencing a different master does not clear the gate',()=>{
  const r=assemble({audioQc:{...audioQc,sha256:'b'.repeat(64)}});
  assert.ok(r.release.reasons.includes('audio_digest_mismatch'));
});
test('unsafe or unscoped private request cannot run customer production',()=>{
  assert.throws(()=>runCustomerCommercialGate({request:{schema:'bad'}}),/customer_gate_schema_invalid/);
  assert.throws(()=>runCustomerCommercialGate({request:{...request,studioDelivery:{videoPath:'/not/here.mp4'}}}),/customer_gate_path_missing|customer_gate_file_missing/);
});

function makeRealStudioDelivery(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-real-delivery-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const videoPath=path.join(dir,'demo.mp4');
  const ff=spawnSync('ffmpeg',['-nostdin','-y','-v','error',
    '-f','lavfi','-i','testsrc2=s=640x360:r=24',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','9','-c:v','mpeg4','-q:v','5','-c:a','aac',videoPath],{encoding:'utf8'});
  if(ff.status!==0)throw new Error('fixture_ffmpeg_failed:'+String(ff.stderr));
  const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const sha=digest(videoPath);
  const names={
    renderReceiptPath:path.join(dir,'demo.render-receipt.json'),
    masterQcReceiptPath:path.join(dir,'demo.master-qc.json'),
    clipManifestPath:path.join(dir,'demo.clip-intake.json'),
  };
  function write(p,obj){fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n','utf8');}
  write(names.renderReceiptPath,{
    schema:'evercraft.fallen.timeline-export-receipt.v1',outputPath:videoPath,sha256:sha,
    durationSec:9,width:640,height:360,fps:24,videoCodec:'mpeg4',audioCodec:'aac',
    inputAssetIds:['verified-source'],
  });
  write(names.masterQcReceiptPath,{
    schema:'evercraft.fallen.master-qc-receipt.v1',status:'accepted',sha256:sha,
    measurements:{durationSec:9,width:640,height:360},
  });
  write(names.clipManifestPath,{
    schema:'evercraft.clip.media-intake.v1',state:'ready_for_clip_intake',
    media:{path:videoPath,sha256:sha,durationSec:9},
  });
  const receiptPath=path.join(dir,'demo.studio-delivery-receipt.json');
  write(receiptPath,{
    schema:'evercraft.fallen.studio-delivery-receipt.v1',
    deliveryId:'fixture-only',outputDir:dir,videoPath,...names,
    mediaSha256:sha,manifestSha256:digest(names.clipManifestPath),
    qualityMode:'commercial',state:'ready_for_clip_intake',
    publicationAuthorityGranted:false,
  });
  const brief={
    ...request,studioDeliveryReceiptPath:receiptPath,
    storyboard:{beats:[
      {id:'hook',role:'hook',durationSec:3,purpose:'test animated sample'},
      {id:'body',role:'body',durationSec:3,purpose:'test real input'},
      {id:'cta',role:'cta',durationSec:3,purpose:'test protected export'},
    ]},
    order:{...request.order,expectedDurationSec:9,aspectRatio:'16:9'},
  };
  return {brief,receiptPath,names,sha,write,digest};
}
test('real encoded customer master can be inspected via its canonical Studio Delivery receipt',t=>{
  const {brief,sha}=makeRealStudioDelivery(t);
  const result=runCustomerCommercialGate({request:brief});
  assert.equal(result.schema,'evercraft.fallen.customer-commercial-gate-report.v1');
  assert.equal(result.masterSha256,sha);
  assert.equal(result.boundaries.deliveryAuthorityGranted,false);
  assert.equal(result.status,'blocked'); // intentionally lacks production/rights/creative proofs
  assert.ok(result.release.reasons.length>0);
});
test('changed Clip manifest bytes fail the canonical receipt check',t=>{
  const {brief,names,write}=makeRealStudioDelivery(t);
  write(names.clipManifestPath,{schema:'evercraft.clip.media-intake.v1',state:'ready_for_clip_intake',
    media:{path:'tampered-source.mp4',sha256:'0'.repeat(64)}});
  assert.throws(()=>runCustomerCommercialGate({request:brief}),/clip_path_does_not_match_master|source_receipts_digest_mismatch|delivery_receipt_digest_mismatch/);
});
test('canonical receipt cannot grant unintended publication or ignore mismatched source digest',t=>{
  const {brief,receiptPath,sha,write}=makeRealStudioDelivery(t);
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  receipt.publicationAuthorityGranted=true;
  write(receiptPath,receipt);
  assert.throws(()=>runCustomerCommercialGate({request:brief}),/delivery_receipt_not_admissible/);
  receipt.publicationAuthorityGranted=false;
  receipt.mediaSha256='f'.repeat(64);
  write(receiptPath,receipt);
  assert.throws(()=>runCustomerCommercialGate({request:brief}),/delivery_receipt_digest_mismatch/);
});
test('manual and canonical source declarations cannot silently override each other',t=>{
  const {brief}=makeRealStudioDelivery(t);
  assert.throws(()=>runCustomerCommercialGate({request:{
    ...brief,studioDelivery:{videoPath:'/tmp/different.mp4'}}}),
    /ambiguous_studio_delivery_sources/);
});
