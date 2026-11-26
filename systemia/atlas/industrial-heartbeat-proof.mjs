// Existing FindMyPart heartbeat may call this fixture benchmark once per fresh tick.
// No live tenants, credentials, network, external actions or retained synthetic orders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {AtlasPrivateFreightLedger} from './private-freight-ledger.mjs';
import {createRecoveryCase,addRecoveryEvidence} from '../findmypart/recovery-engine.mjs';
import {resumeIndustrialProof} from './industrial-order-resume.mjs';
const schema='evercraft.industrial.heartbeat-proof.v1';
const authority={synthetic:true,worker_dispatched:false,purchase_authorized:false,
 dispatch_authorized:false,real_revenue_cents:0,real_world_recoveries_verified:0};
export function runIndustrialHeartbeatProof(){
 let root;
 try{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'industrial-heartbeat-'));
  fs.chmodSync(root,0o700);
  const dirs={stateDir:path.join(root,'atlas'),passportStateDir:path.join(root,'passport'),identityStateDir:path.join(root,'identity')};
  const secret=randomBytes(48).toString('base64');
  const passport=new EvercraftPassport({stateDir:dirs.passportStateDir});
  new EvercraftIdentity({stateDir:dirs.identityStateDir});
  const now=Date.now(),until=new Date(now+600000).toISOString();
  const subject='user:industrial-synthetic';
  passport.issueGrant({idempotency_key:'industrial-heartbeat-fixture',subject_ref:subject,
   issuer_ref:'evercraft:identity-authority',product:'systemia-atlas',
   scopes:['atlas.read','atlas.write'],resource_refs:['tenant:industrial-proof'],
   starts_at:new Date(now-60000).toISOString(),ends_at:until,max_delegation_depth:0,
   authority_state:'verified_identity_authority',authority_receipt_ref:'test:identity:owner'});
  const session={schema:'evercraft.identity.session.v1',signing_key_id:'test',
   subject_ref:subject,display_name:'Synthetic Operator',session_id:'industrial-heartbeat-fixture',
   issued_at:new Date(now).toISOString(),expires_at:until};
  const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
  const sessionToken=encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
  const open=()=>new AtlasPrivateFreightLedger({...dirs,sessionKeyring:{test:secret}});
  const input={orderId:'SIM-HEARTBEAT-001',recovery:addRecoveryEvidence(createRecoveryCase({
   description:'Synthetic discontinued control knob',equipment:'Demo machine'
  }),{track:'original',url:'https://example.invalid/knob',claim:'Synthetic fixture only'}),
   quote:{synthetic:true,sale_cents:15000,merchandise_cents:9500,freight_cents:1500,fees_cents:500,reserve_cents:500},
   shipment:{synthetic:true,origin:'Portland, OR',destination:'Yakima, WA',equipment:'Synthetic parcel'}};
  const run=(value=input,maxSteps=3)=>resumeIndustrialProof({ledger:open(),sessionToken,input:value,maxSteps});
  const partial=run(input,1);
  const complete=run();
  const replay=run();
  const snapshot=open().read({tenant:'industrial-proof',sessionToken});
  let conflictHeld=false;
  try{run({...input,quote:{...input.quote,sale_cents:16000}})}
  catch(e){if(e.message==='atlas_idempotency_conflict')conflictHeld=true;else throw e}
  const after=open().read({tenant:'industrial-proof',sessionToken});
  if(partial.complete||!complete.complete||!replay.complete||
     partial.receipts.length!==1||complete.receipts.length!==3||
     complete.receipts[0].event_hash!==partial.receipts[0].event_hash||
     !replay.receipts.every((r,i)=>r.state==='duplicate'&&r.event_hash===complete.receipts[i].event_hash)||
     snapshot.revision!==3||after.revision!==3||snapshot.loads.length!==1||
     after.loads.length!==1||!conflictHeld||snapshot.dispatch_authorized!==false)
   throw Error('industrial_benchmark_invariant_failed');
  const evidence_ref='sha256:'+createHash('sha256').update(JSON.stringify(complete.receipts)).digest('hex');
  return {schema,state:'passed',executed:true,replayed_events:3,synthetic_loads:1,
   conflict_held:true,evidence_ref,...authority};
 }catch{
  return {schema,state:'held',executed:true,replayed_events:0,synthetic_loads:0,
   conflict_held:false,evidence_ref:null,...authority};
 }finally{
  if(root)fs.rmSync(root,{recursive:true,force:true});
 }
}
// Only a narrow, authority-free summary crosses into the company report.
export function projectIndustrialHeartbeatProof(value){
 const base={schema,...authority};
 if(!value)return {...base,state:'not_executed',executed:false};
 if(value.schema!==schema||value.synthetic!==true||value.executed!==true||
    Object.entries(authority).some(([k,v])=>value[k]!==v))
  return {...base,state:'held',executed:false};
 if(value.state==='passed'&&value.replayed_events===3&&value.synthetic_loads===1&&
    value.conflict_held===true&&typeof value.evidence_ref==='string'&&/^sha256:[a-f0-9]{64}$/.test(value.evidence_ref))
  return {...base,state:'passed',executed:true,replayed_events:3,synthetic_loads:1,
   conflict_held:true,evidence_ref:value.evidence_ref};
 return {...base,state:'held',executed:true};
}
