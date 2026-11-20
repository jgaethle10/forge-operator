import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {offerVerifiedWingReceiptToSystemia} from '../wing-courier/intake-bridge.mjs';
import {inspectOwnedCommercialLoop,OWNED_READ_MODEL_SCHEMA} from './owned-receiver-evidence.mjs';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const write=(file,data)=>fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});
function fixture(t,{count=12,withPackage=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'commercial-custody-proof-'));
 fs.chmodSync(dir,0o700);
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const custodyRoot=path.join(dir,'custody');
 fs.mkdirSync(custodyRoot,{mode:0o700});
 const order={schema:'evercraft.commercial-loop.order.v1',
   orderId:'opaque-order-001',packageId:'e'.repeat(32),
   pageId:'private-page',threadId:'private-thread',
   offerKey:'fallen-commercial-30s',
   agreedPriceCents:5000,currency:'usd',paymentPolicy:'AFTER_APPROVED_PREVIEW',
   expectedAssetCount:12};
 const orderFile=path.join(dir,'order.json');
 write(orderFile,JSON.stringify(order));
 const packageDir=path.join(custodyRoot,order.packageId);
 let receipt;
 if(withPackage){
  fs.mkdirSync(packageDir,{mode:0o700});
  const assets=[];
  for(let i=0;i<count;i++){
   const filename='synthetic-'+String(i).padStart(3,'0')+'.jpg';
   const bytes=Buffer.from('synthetic opaque asset '+i);
   write(path.join(packageDir,filename),bytes);
   assets.push({filename,bytes:bytes.length,sha256:hash(bytes)});
  }
  receipt={schema:'evercraft.systemia.wing-receive-receipt.v1',
   id:order.packageId,fromWing:'harbor',toWing:'fallen',kind:'media',
   assets,ciphertextSha256:'f'.repeat(64),receivedAt:'2026-11-20T09:00:00.000Z',
   receiverHostname:os.hostname(),state:'AUTHENTICATED_BYTES_RECEIVED',
   privateCustodyVerified:true,
   authority:{execution:false,systemiaAdmission:false,production:false,
     payment:false,customerDelivery:false,publication:false}};
  write(path.join(packageDir,'receipt.json'),JSON.stringify(receipt));
 }
 const passportStateDir=path.join(dir,'passport');
 const intakeStateDir=path.join(dir,'intake');
 fs.mkdirSync(passportStateDir,{mode:0o700});
 fs.mkdirSync(intakeStateDir,{mode:0o700});
 const args={orderFile,custodyRoot,intakeStateDir,passportStateDir,
   intakeReadActorRef:'operator:commercial-audit'};
 return {dir,custodyRoot,packageDir,order,orderFile,receipt,args,intakeStateDir,passportStateDir};
}
function grant(f,subject,scope){
 const passport=new EvercraftPassport({stateDir:f.passportStateDir});
 passport.issueGrant({grant_id:'grant-'+subject.replace(/[^a-z0-9]/gi,'-')+'-'+scope.replace(/\W/g,'-'),
   idempotency_key:'synthetic-'+subject+'-'+scope,
   subject_ref:subject,issuer_ref:'evercraft:identity-authority',
   product:'evercraft-intake',scopes:[scope],
   starts_at:'2026-01-01T00:00:00Z',ends_at:'2027-12-31T00:00:00Z',
   authority_state:'verified_identity_authority',
   authority_receipt_ref:'identity:synthetic-operator'});
}
function admitted(f){
 grant(f,'adapter:wing-courier','intake.write.agent');
 const result=offerVerifiedWingReceiptToSystemia({
  receipt:f.receipt,intakeStateDir:f.intakeStateDir,passportStateDir:f.passportStateDir});
 write(path.join(f.packageDir,'intake-offer.json'),JSON.stringify(result));
 return result;
}
test('missing physical receiver package stays at AWAITING_PRIVATE_CUSTODY',t=>{
 const f=fixture(t,{withPackage:false});
 const r=inspectOwnedCommercialLoop(f.args);
 assert.equal(r.schema,OWNED_READ_MODEL_SCHEMA);
 assert.equal(r.stage,'AWAITING_PRIVATE_CUSTODY');
 assert.equal(r.custodyVerifiedByLocalRehash,false);
 assert.equal(r.ownerMachineReadOnly,true);
});
test('actual sealed receipt and every one of twelve assets rehashed; Passport remains separate',t=>{
 const f=fixture(t);
 const r=inspectOwnedCommercialLoop(f.args);
 assert.equal(r.stage,'AWAITING_PASSPORT_INTAKE');
 assert.equal(r.custodyVerifiedByLocalRehash,true);
 assert.equal(r.verifiedAssetCount,12);
 assert.equal(r.passportCandidateReadback,false);
 assert.equal(r.previewSentByThisTool,false);
 assert.equal(fs.existsSync(path.join(f.packageDir,'intake-offer.json')),false);
 assert.doesNotMatch(JSON.stringify(r),/synthetic-000|private-thread|opaque-order-001/);
});
test('real Passport candidate readback with granted intake.read advances only to capacity review',t=>{
 const f=fixture(t);
 const intake=admitted(f);
 assert.match(intake.intakeReceiptHash,/^sha256:[a-f0-9]{64}$/);
 const before=inspectOwnedCommercialLoop(f.args);
 assert.equal(before.stage,'INTAKE_CONFLICT');
 grant(f,'operator:commercial-audit','intake.read');
 const after=inspectOwnedCommercialLoop(f.args);
 assert.equal(after.stage,'AWAITING_PRODUCTION_ASSIGNMENT');
 assert.equal(after.passportCandidateReadback,true);
 assert.equal(after.productionExecutionGranted,undefined);
 assert.equal(after.producerAssignedByThisTool,false);
 assert.equal(after.paymentTakenByThisTool,false);
});
test('unauthorized actor cannot read Passport-backed candidate or elevate intake',t=>{
 const f=fixture(t);
 admitted(f);
 const result=inspectOwnedCommercialLoop(f.args);
 assert.equal(result.stage,'INTAKE_CONFLICT');
 assert.equal(result.passportCandidateReadback,false);
});
test('changed source bytes reject custody before any Systemia status advances',t=>{
 const f=fixture(t);
 const p=path.join(f.packageDir,f.receipt.assets[0].filename);
 fs.writeFileSync(p,'bad media bytes');
 const r=inspectOwnedCommercialLoop(f.args);
 assert.equal(r.stage,'CUSTODY_CONFLICT');
 assert.equal(r.custodyVerifiedByLocalRehash,false);
});
test('wrong expected asset count and wrong receiver hostname do not make a transfer receipt',t=>{
 const f=fixture(t,{count:11});
 assert.equal(inspectOwnedCommercialLoop(f.args).stage,'CUSTODY_CONFLICT');
 const g=fixture(t);
 const file=path.join(g.packageDir,'receipt.json');
 const r=JSON.parse(fs.readFileSync(file,'utf8'));r.receiverHostname='impostor';
 fs.writeFileSync(file,JSON.stringify(r));
 assert.equal(inspectOwnedCommercialLoop(g.args).stage,'CUSTODY_CONFLICT');
});
test('extra unreviewed file, symlink asset and hardlink asset are all blocked',t=>{
 const f=fixture(t);write(path.join(f.packageDir,'other.txt'),'untrusted');
 assert.equal(inspectOwnedCommercialLoop(f.args).stage,'CUSTODY_CONFLICT');
 const g=fixture(t),name=g.receipt.assets[0].filename;
 fs.unlinkSync(path.join(g.packageDir,name));
 fs.symlinkSync('/etc/hostname',path.join(g.packageDir,name));
 assert.equal(inspectOwnedCommercialLoop(g.args).stage,'CUSTODY_CONFLICT');
 const h=fixture(t),p=path.join(h.packageDir,h.receipt.assets[0].filename);
 fs.linkSync(p,path.join(h.dir,'hardlink-copy'));
 assert.equal(inspectOwnedCommercialLoop(h.args).stage,'CUSTODY_CONFLICT');
});
test('tampered Passport candidate identity or intake receipt cannot promote order',t=>{
 const f=fixture(t);const intake=admitted(f);grant(f,'operator:commercial-audit','intake.read');
 const offerPath=path.join(f.packageDir,'intake-offer.json');
 const bad={...intake,candidateId:'unrelated-candidate'};
 fs.writeFileSync(offerPath,JSON.stringify(bad));
 assert.equal(inspectOwnedCommercialLoop(f.args).stage,'INTAKE_CONFLICT');
});
test('no buyer identifiers, filenames, credentials, or full hashes in standard report',t=>{
 const f=fixture(t);grant(f,'operator:commercial-audit','intake.read');admitted(f);
 const report=inspectOwnedCommercialLoop(f.args);
 const text=JSON.stringify(report);
 assert.equal(report.stage,'AWAITING_PRODUCTION_ASSIGNMENT');
 for(const forbidden of ['opaque-order-001','private-page','private-thread',
  'synthetic-000.jpg','source:','/tmp/','f'.repeat(64)])
  assert.ok(!text.includes(forbidden));
});
test('read-only adapter does not create any intake or payment records on observation',t=>{
 const f=fixture(t);
 const before=fs.readdirSync(f.packageDir).sort();
 inspectOwnedCommercialLoop(f.args);
 inspectOwnedCommercialLoop(f.args);
 assert.deepEqual(fs.readdirSync(f.packageDir).sort(),before);
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
 assert.deepEqual(fs.readdirSync(f.passportStateDir),[]);
});

test('private order descriptor cannot be read from world-accessible parent folder',t=>{
 const f=fixture(t);
 const outer=path.join(f.dir,'exposed');
 fs.mkdirSync(outer,{mode:0o755});
 const moved=path.join(outer,'order.json');
 fs.renameSync(f.orderFile,moved);
 assert.throws(()=>inspectOwnedCommercialLoop({...f.args,orderFile:moved}),
   /private_directory_required/);
});
