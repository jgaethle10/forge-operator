import assert from 'node:assert/strict';
import test from 'node:test';
import {
 oneCompanyCapabilityInventory,projectOneCompanyCourierHandoff,
 ONE_COMPANY_COURIER_SCHEMA
} from './courier-handoff.mjs';

const H='a'.repeat(64),ID='b'.repeat(32);
const receipt=(names=['camera-original.mov','logo.png'])=>({
 schema:'evercraft.systemia.wing-receive-receipt.v1',
 id:ID,fromWing:'harbor',toWing:'fallen',kind:'media',
 ciphertextSha256:H,state:'AUTHENTICATED_BYTES_RECEIVED',
 privateCustodyVerified:true,
 assets:names.map((filename,i)=>({filename,sha256:String((i+1)%10).repeat(64),bytes:1024+i}))
});
const intake=()=>({
 schema:'evercraft.wing-courier.intake-handoff.v1',packageId:ID,
 intakeState:'candidate_only',candidateId:'intake-synthetic-private',
 intakeReceiptHash:'sha256:'+H,admissionGranted:false,executionGranted:false,
 customerDeliveryGranted:false
});
const plan=(o={})=>projectOneCompanyCourierHandoff({
 receipt:o.receipt??receipt(),intake:o.intake??intake()});
const department=(p,name)=>p.departments.find(x=>x.department===name);
test('real canonical registries participate in one-company discovery without a live-connection claim',()=>{
 const inventory=oneCompanyCapabilityInventory();
 assert.ok(inventory.publicProductKeys.length>30);
 assert.ok(inventory.registeredSabanSoftware.length>10);
 assert.ok(inventory.declaredSharedRuntimeContracts.length>=10);
 for(const id of ['forensiscope','fallen-production','fallen-creative-council',
  'fallen-shot-tournament'])assert.ok(inventory.registeredSabanSoftware.includes(id));
 assert.ok(inventory.publicProductKeys.includes('forensiscope'));
 assert.ok(inventory.declaredSharedRuntimeContracts.includes('forensiscope'));
 assert.equal(inventory.allLiveConnected,false);
 assert.equal(inventory.sourceInventoryOnly,true);
});
test('private Courier receipt after Passport candidate produces an inert joined Saban/ForensiScope/Fallen plan',()=>{
 const p=plan();
 assert.equal(p.schema,ONE_COMPANY_COURIER_SCHEMA);
 assert.equal(p.stage,'AWAITING_SEPARATE_SYSTEMIA_MISSION_ADMISSION');
 assert.equal(p.mediaAssetCount,2);
 assert.equal(p.audioVideoAssetCount,1);
 assert.equal(department(p,'systemia').state,'INERT_INTAKE_CANDIDATE_RECORDED');
 assert.equal(department(p,'forensiscope').state,
  'HOLD_RIGHTS_REVIEW_AND_AUTHORIZED_LOCAL_SOURCE_VALIDATION');
 assert.equal(department(p,'forensiscope').actualMediaAnalysisExecuted,false);
 assert.equal(department(p,'saban').boundedForensiScopeFormation.state,
  'BOUNDED_FORMATION_PROPOSAL');
 assert.equal(department(p,'saban').boundedForensiScopeFormation.workerLeaseGranted,false);
 assert.equal(department(p,'saban').boundedFallenFormation.state,'BOUNDED_FORMATION_PROPOSAL');
 assert.equal(department(p,'fallen').productionAdapterRegistered,true);
 assert.equal(department(p,'fallen').creativeCouncilRegistered,true);
 assert.equal(department(p,'evercraft-clip').productContractDeclared,true);
 for(const d of p.departments){
  assert.equal(d.executionAuthorized,false);
  assert.equal(d.customerContactAuthorized,false);
  assert.equal(d.paymentAuthorized,false);
 }
 assert.equal(p.productionAuthority,false);
 assert.equal(p.customerMediaTransmitted,false);
 assert.equal(p.forensiScopeMediaAutoTransfer,false);
 assert.equal(p.sourceHashesIncluded,false);
 assert.equal(p.sourceFilenamesIncluded,false);
 assert.doesNotMatch(JSON.stringify(p),/camera-original|logo\.png|11111111/);
 assert.equal(p.realNodeRuntimeObserved,false);
});
test('image-only recovery can proceed to human Fallen review without auto-running ForensiScope',()=>{
 const p=plan({receipt:receipt(['photo.jpg','brand.png'])});
 assert.equal(p.audioVideoAssetCount,0);
 assert.equal(department(p,'forensiscope').state,'NOT_APPLICABLE_NO_AUDIO_VIDEO');
 assert.equal(department(p,'saban').boundedForensiScopeFormation.state,'UNREGISTERED');
 assert.equal(department(p,'fallen').productionAdapterRegistered,true);
 assert.equal(p.previewSent,false);
});
test('forged custody, wrong route, malformed manifest or duplicate filenames fail closed',()=>{
 for(const changed of [
  {privateCustodyVerified:false},
  {state:'BROKER_CIPHERTEXT_STORED'},
  {fromWing:'public'},
  {toWing:'harbor'},
  {ciphertextSha256:'bad'},
  {assets:[]},
  {assets:[{filename:'../x.mov',sha256:H,bytes:1}]},
  {assets:[{filename:'one\\\\bad.mov',sha256:H,bytes:1}]},
  {assets:[{filename:'video.mov',sha256:H,bytes:1},
            {filename:'VIDEO.MOV',sha256:H,bytes:1}]},
 ])assert.throws(()=>plan({receipt:{...receipt(),...changed}}),/one_company_courier_/);
});
test('Passport-intake conflicts and counterfeit job authority fail closed',()=>{
 for(const changed of [
  {intakeState:'accepted_for_production'},
  {packageId:'c'.repeat(32)},
  {intakeReceiptHash:'invalid'},
  {admissionGranted:true},
  {executionGranted:true},
  {customerDeliveryGranted:true},
  {candidateId:null}
 ])assert.throws(()=>plan({intake:{...intake(),...changed}}),
  /passport_intake_candidate_required/);
});
test('Passport duplicate outcome is idempotent planning, never a new job',()=>{
 const p=plan({intake:{...intake(),intakeState:'duplicate'}});
 assert.equal(p.stage,'AWAITING_SEPARATE_SYSTEMIA_MISSION_ADMISSION');
 assert.equal(p.workerDispatched,false);
 assert.equal(p.shippingInitiated,false);
});
