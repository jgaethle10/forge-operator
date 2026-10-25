import assert from 'node:assert/strict';
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
