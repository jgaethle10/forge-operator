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
import {planIndustrialProof,assertSameIndustrialIntent} from './industrial-order-proof.mjs';

function fixture(){
 const recovery=addRecoveryEvidence(createRecoveryCase({
  description:'Synthetic discontinued control knob',equipment:'Demo packaging machine',
  references:[{kind:'part_number',reference:'DEMO-KNOB-001'}]
 }),{track:'original',url:'https://example.invalid/demo-knob',claim:'Synthetic fixture only'});
 return {orderId:'SIM-ORDER-001',recovery,
  quote:{synthetic:true,sale_cents:15000,merchandise_cents:9500,freight_cents:1500,fees_cents:500,reserve_cents:500},
  shipment:{synthetic:true,origin:'Portland, OR',destination:'Yakima, WA',equipment:'Synthetic parcel'}};
}
test('exact integer landed cost and single freight allocation',()=>{
 const p=planIndustrialProof(fixture());
 assert.equal(p.costs.total_cost_cents,12000);
 assert.equal(p.costs.contribution_cents,3000);
 assert.equal(p.costs.contribution_bps,2000);
 assert.equal(p.freight.customer_rate_cents,p.freight.carrier_cost_cents);
 assert.equal(p.purchase_authorized,false);
 assert.equal(p.dispatch_authorized,false);
 assert.equal(p.real_revenue_cents,0);
});
test('stable order identity independent of changed costs, with explicit conflict',()=>{
 const f=fixture(),p=planIndustrialProof(f);
 assert.deepEqual(planIndustrialProof(structuredClone(f)),p);
 f.quote.sale_cents=16000;
 const q=planIndustrialProof(f);
 assert.equal(q.order_ref,p.order_ref);
 assert.deepEqual(q.keys,p.keys);
 assert.notEqual(q.intent_hash,p.intent_hash);
 assert.throws(()=>assertSameIndustrialIntent(p,q),/industrial_intent_conflict/);
 assert.equal(assertSameIndustrialIntent(p,planIndustrialProof(fixture())),true);
});
test('live, unsafe and missing evidence inputs are held',()=>{
 const f=fixture();
 assert.throws(()=>planIndustrialProof({...f,quote:{...f.quote,synthetic:false}}),/synthetic_only/);
 assert.throws(()=>planIndustrialProof({...f,orderId:'LIVE-1'}),/synthetic_order_id_required/);
 const unsafe=createRecoveryCase({description:'Brake component',equipment:'Truck'});
 assert.throws(()=>planIndustrialProof({...f,recovery:unsafe}),/recovery_review_hold/);
 assert.throws(()=>planIndustrialProof({...f,recovery:createRecoveryCase({description:'Unknown knob'})}),/synthetic_evidence_required/);
 const live=addRecoveryEvidence(createRecoveryCase({description:'Unknown knob'}),{
  track:'original',url:'https://example.com/part',claim:'Unverified supplier lead'});
 assert.throws(()=>planIndustrialProof({...f,recovery:live}),/synthetic_evidence_required/);
});
test('invalid cents and below-threshold costs are held',()=>{
 const f=fixture();
 for(const v of [-1,0.5,NaN,100000001])
  assert.throws(()=>planIndustrialProof({...f,quote:{...f.quote,merchandise_cents:v}}),/invalid_cost_input/);
 assert.throws(()=>planIndustrialProof({...f,quote:{...f.quote,freight_cents:1501}}),/insufficient_margin/);
 assert.throws(()=>planIndustrialProof({...f,quote:{...f.quote,sale_cents:0}}),/positive_sale_and_freight_required/);
 assert.throws(()=>planIndustrialProof({...f,shipment:{...f.shipment,destination:f.shipment.origin}}),/same_origin_destination/);
});
test('isolated ledger writes, replay, duplicate refusal and dispatch hold',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'industrial-proof-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dirs={stateDir:path.join(root,'atlas'),passportStateDir:path.join(root,'passport'),identityStateDir:path.join(root,'identity')};
 const secret='test-only-industrial-proof-key-1234567890-1234567890';
 const passport=new EvercraftPassport({stateDir:dirs.passportStateDir});
 new EvercraftIdentity({stateDir:dirs.identityStateDir});
 const now=new Date(),until=new Date(now.getTime()+3600000);
 const session={schema:'evercraft.identity.session.v1',signing_key_id:'test',
  subject_ref:'user:alice',display_name:'Synthetic Operator',session_id:'industrial-sim-001',
  issued_at:now.toISOString(),expires_at:until.toISOString()};
 const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
 const token=encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
 passport.issueGrant({idempotency_key:'industrial-sim-grant',subject_ref:'user:alice',
  issuer_ref:'evercraft:identity-authority',product:'systemia-atlas',
  scopes:['atlas.read','atlas.write'],resource_refs:['tenant:alpha'],
  starts_at:new Date(now.getTime()-60000).toISOString(),ends_at:until.toISOString(),
  max_delegation_depth:0,authority_state:'verified_identity_authority',
  authority_receipt_ref:'test:identity:owner'});
 const open=()=>new AtlasPrivateFreightLedger({...dirs,sessionKeyring:{test:secret}});
 const write=(type,payload,key,revision)=>open().mutate({
  sessionToken:token,tenant:'alpha',type,payload,idempotencyKey:key,expectedRevision:revision});
 const p=planIndustrialProof(fixture());
 const shipper=write('shipper.created',{name:'Synthetic Sage Supply'},p.keys.shipper,0);
 const payload={shipper_id:shipper.record.id,origin:p.freight.origin,
  destination:p.freight.destination,equipment:p.freight.equipment};
 const load=write('load.opened',payload,p.keys.load,1);
 const quotePayload={load_id:load.record.id,customer_rate_cents:p.freight.customer_rate_cents,
  carrier_cost_cents:p.freight.carrier_cost_cents};
 const quote=write('load.quoted',quotePayload,p.keys.quote,2);
 assert.equal(quote.record.status,'draft_not_sent');
 const dupe=write('load.opened',payload,p.keys.load,1);
 assert.equal(dupe.state,'duplicate');assert.equal(dupe.event_hash,load.event_hash);
 assert.throws(()=>write('load.opened',{...payload,destination:'Spokane, WA'},p.keys.load,3),/atlas_idempotency_conflict/);
 assert.throws(()=>write('load.dispatched',{load_id:load.record.id},p.order_ref+':dispatch',3),/atlas_event_type_denied/);
 const snapshot=open().read({tenant:'alpha',sessionToken:token});
 assert.equal(snapshot.revision,3);
 assert.equal(snapshot.loads.length,1);
 assert.equal(snapshot.dispatch_authorized,false);
 assert.ok(snapshot.events.some(e=>e.hash===quote.event_hash));
 console.log(JSON.stringify({proof:'INDUSTRIAL-002',order_ref:p.order_ref,intent_hash:p.intent_hash,
  freight_event_hash:quote.event_hash,revision:snapshot.revision,duplicate_prevented:true,
  synthetic:true,purchase_authorized:false,dispatch_authorized:false,real_revenue_cents:0}));
});
