import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {AtlasPrivateFreightLedger} from './private-freight-ledger.mjs';
import {createRecoveryCase,addRecoveryEvidence} from '../findmypart/recovery-engine.mjs';
import {planIndustrialProof} from './industrial-order-proof.mjs';
import {resumeIndustrialProof} from './industrial-order-resume.mjs';

function fixture(){
 return {orderId:'SIM-ORDER-001',recovery:addRecoveryEvidence(createRecoveryCase({
  description:'Synthetic discontinued control knob',equipment:'Demo machine'
 }),{track:'original',url:'https://example.invalid/knob',claim:'Synthetic fixture only'}),
 quote:{synthetic:true,sale_cents:15000,merchandise_cents:9500,freight_cents:1500,fees_cents:500,reserve_cents:500},
 shipment:{synthetic:true,origin:'Portland, OR',destination:'Yakima, WA',equipment:'Synthetic parcel'}};
}
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'industrial-resume-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dirs={stateDir:path.join(root,'atlas'),passportStateDir:path.join(root,'passport'),identityStateDir:path.join(root,'identity')};
 const secret='test-only-industrial-resume-key-1234567890-1234567890';
 const passport=new EvercraftPassport({stateDir:dirs.passportStateDir});
 new EvercraftIdentity({stateDir:dirs.identityStateDir});
 const now=new Date(),until=new Date(now.getTime()+3600000);
 function grant(subject,scopes=['atlas.read','atlas.write'],tenant='industrial-proof'){
  passport.issueGrant({idempotency_key:'grant:'+subject+':'+tenant,subject_ref:subject,
   issuer_ref:'evercraft:identity-authority',product:'systemia-atlas',
   scopes,resource_refs:['tenant:'+tenant],
   starts_at:new Date(now.getTime()-60000).toISOString(),ends_at:until.toISOString(),
   max_delegation_depth:0,authority_state:'verified_identity_authority',
   authority_receipt_ref:'test:identity:owner'});
 }
 function token(subject){
  const session={schema:'evercraft.identity.session.v1',signing_key_id:'test',
   subject_ref:subject,display_name:'Synthetic Operator',session_id:'industrial-'+subject.split(':')[1],
   issued_at:now.toISOString(),expires_at:until.toISOString()};
  const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
  return encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
 }
 grant('user:alice');
 const open=()=>new AtlasPrivateFreightLedger({...dirs,sessionKeyring:{test:secret}});
 const run=(input=fixture(),maxSteps=3,sessionToken=token('user:alice'))=>
  resumeIndustrialProof({ledger:open(),sessionToken,input,maxSteps});
 const snapshot=()=>open().read({tenant:'industrial-proof',sessionToken:token('user:alice')});
 return {open,run,snapshot,grant,token};
}
for(const stop of [1,2])test('resume after '+stop+' durable event(s)',t=>{
 const {run,snapshot}=setup(t);
 const partial=run(fixture(),stop);
 assert.equal(partial.complete,false);assert.equal(snapshot().revision,stop);
 const complete=run();assert.equal(complete.complete,true);
 assert.equal(snapshot().revision,3);assert.equal(snapshot().loads.length,1);
 for(let i=0;i<stop;i++){
  assert.equal(complete.receipts[i].state,'duplicate');
  assert.equal(complete.receipts[i].event_hash,partial.receipts[i].event_hash);
 }
 const again=run();assert.ok(again.receipts.every(r=>r.state==='duplicate'));
 assert.deepEqual(again.receipts.map(r=>r.event_hash),complete.receipts.map(r=>r.event_hash));
 assert.equal(snapshot().revision,3);
 assert.equal(complete.real_revenue_cents,0);assert.equal(complete.dispatch_authorized,false);
 console.log(JSON.stringify({proof:'INDUSTRIAL-003',interruption_after:stop,
  order_ref:complete.order_ref,freight_event_hash:complete.receipts[2].event_hash,
  revision:3,synthetic:true,dispatch_authorized:false}));
});
test('changed intent cannot create new effects after first stage',t=>{
 const {run,snapshot}=setup(t);
 run(fixture(),1);
 const changed=fixture();changed.quote.sale_cents=16000;
 assert.throws(()=>run(changed),/atlas_idempotency_conflict/);
 assert.equal(snapshot().revision,1);
 assert.equal(snapshot().loads.length,0);
 assert.equal(run().complete,true);
});
test('distinct order IDs coexist without duplicate loads',t=>{
 const {run,snapshot}=setup(t);
 run(fixture(),1);
 const other=fixture();other.orderId='SIM-ORDER-002';
 assert.equal(run(other).complete,true);
 assert.equal(run().complete,true);
 assert.equal(snapshot().revision,6);
 assert.equal(snapshot().loads.length,2);
 assert.equal(snapshot().shippers.length,2);
});
test('receipt lookup requires exact hash, original actor and tenant read grant',t=>{
 const {run,open,grant,token}=setup(t);
 const p=planIndustrialProof(fixture()),r=run(fixture(),1).receipts[0];
 const req={tenant:'industrial-proof',idempotencyKey:p.keys.shipper,eventHash:r.event_hash,sessionToken:token('user:alice')};
 assert.equal(open().readMutationReceipt(req).type,'shipper.created');
 assert.throws(()=>open().readMutationReceipt({...req,eventHash:'sha256:'+'0'.repeat(64)}),/atlas_receipt_unavailable/);
 grant('user:bob');
 assert.throws(()=>open().readMutationReceipt({...req,sessionToken:token('user:bob')}),/atlas_receipt_unavailable/);
 grant('user:writer',['atlas.write']);
 assert.throws(()=>open().readMutationReceipt({...req,sessionToken:token('user:writer')}),/atlas_access_denied/);
 assert.throws(()=>open().readMutationReceipt({...req,tenant:'beta'}),/atlas_access_denied/);
});
