import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {liftSubjectActorId} from './identity-boundary.mjs';
import {startLiftLoopbackLab} from './loopback-service-lab.mjs';

const SECRET='lift-loopback-test-only-identity-key-2026-11-16-over32';
const SUBJECTS={owner:'user:lift-http-owner',stranger:'user:lift-http-stranger',
  reviewer:'user:lift-http-reviewer',applicant:'user:lift-http-applicant',
  vetter:'user:lift-http-vetter',approver:'user:lift-http-approver'};
const CASE='lab_case_http001',EVIDENCE='lab_evidence_http001',PARTNER='lab_partner_http001';

async function rig(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lift-loopback-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const identity=new EvercraftIdentity({stateDir:path.join(base,'identity')});
  const passport=new EvercraftPassport({stateDir:path.join(base,'passport')});
  const sessions={};
  const now=new Date(),earlier=new Date(now.getTime()-60000),later=new Date(now.getTime()+3600000);
  for(const [who,subject_ref] of Object.entries(SUBJECTS)){
    sessions[who]=identity.issueSession({
      schema:'evercraft.identity.authentication.v1',
      subject_ref,display_name:'Fictional Lab User',auth_strength:'password',
    },{signingSecret:SECRET,signingKeyId:'primary',ttlSeconds:1800,now});
  }
  let n=0;
  function grant(who,scope,resource){
    return passport.issueGrant({
      idempotency_key:'lab-http-grant-'+(++n),
      issuer_ref:'system:lab-fixture',
      subject_ref:SUBJECTS[who],product:'evercraft-lift',
      scopes:[scope],...(resource?{resource_refs:[resource]}:{}),
      starts_at:earlier.toISOString(),ends_at:later.toISOString(),
      authority_state:'manual_authorized',
      authority_receipt_ref:'lab-fixture-authority',
    }).grant;
  }
  const settings={
    identity,passport,keyring:{primary:SECRET},
    journalDirectory:path.join(base,'journal'),
    vaultDirectory:path.join(base,'vault'),vaultMasterKey:randomBytes(32),
  };
  async function start(){return startLiftLoopbackLab(settings);}
  const request=async(service,method,url,{as,body,headers}={})=>{
    const response=await fetch(service.origin+url,{
      method,
      headers:{...(as?{authorization:'Bearer '+sessions[as].token}:{}),
        ...(body!==undefined?{'content-type':'application/json'}:{}),...headers},
      ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
    });
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  const caseInput=()=>({id:CASE,owner_id:liftSubjectActorId(SUBJECTS.owner),
    category:'utilities',assistance_kind:'bill_payment',goal_cents:31000,
    region:'Lab Region',vault_ref:'vault:lab_reference_001',data_processing_consent:true});
  const partnerInput=()=>({id:PARTNER,owner_id:liftSubjectActorId(SUBJECTS.applicant),
    public_name:'Fictional Relief Group',regions:['Lab Region'],
    categories:['utilities'],assistance_kinds:['bill_payment']});
  return {base,identity,passport,sessions,grant,start,request,caseInput,partnerInput};
}
test('binding to a public interface is rejected before any service is created',async(t)=>{
  const r=await rig(t);
  await assert.rejects(startLiftLoopbackLab({
    host:'0.0.0.0',identity:r.identity,keyring:{primary:SECRET},
  }),/loopback_only/);
  await assert.rejects(startLiftLoopbackLab({
    host:'localhost',identity:r.identity,keyring:{primary:SECRET},
  }),/loopback_only/);
});
test('health is fictional, no payments route, untrusted Host/Origin rejected',async t=>{
  const r=await rig(t),s=await r.start();
  try{
    const health=await r.request(s,'GET','/health');
    assert.equal(health.status,200);
    assert.equal(health.body.lab_only,true);
    assert.equal(health.body.payments_enabled,false);
    assert.equal(health.headers.get('cache-control'),'no-store');
    assert.equal((await r.request(s,'POST','/lab/payments',
      {as:'owner',body:{amount_cents:100}})).status,404);
    assert.equal((await r.request(s,'GET','/health',
      {headers:{origin:'https://attacker.example'}})).status,403);
    assert.equal((await r.request(s,'GET','/health',
      {headers:{host:'attacker.example'}})).status,403);
    assert.equal((await r.request(s,'GET','/health?secret=1')).status,400);
  }finally{await s.close();}
});
test('missing or forged session is denied without exposing case lookup details',async t=>{
  const r=await rig(t),s=await r.start();
  try{
    const noAuth=await r.request(s,'POST','/lab/cases',
      {body:{input:r.caseInput(),operationId:'lab_op_case_http001'}});
    assert.equal(noAuth.status,401);
    assert.equal(noAuth.body.error,'unauthorized');
    const forged=await r.request(s,'POST','/lab/cases',
      {headers:{authorization:'Bearer forged.abc.signature'},
        body:{input:r.caseInput(),operationId:'lab_op_case_http001'}});
    assert.equal(forged.status,401);
    assert.equal(forged.body.error,'request_denied');
    assert.ok(!JSON.stringify(forged.body).includes('signature'));
  }finally{await s.close();}
});
test('end-to-end: HTTP case intake and encrypted fiction, reviewer read, owner withdrawal',async t=>{
  const r=await rig(t);
  r.grant('owner','case.submit');
  r.grant('owner','case.withdraw');
  r.grant('owner','evidence.write','lift:case:'+CASE);
  r.grant('owner','evidence.revoke','lift:case:'+CASE);
  r.grant('reviewer','case.review','lift:case:'+CASE);
  r.grant('reviewer','evidence.read','lift:case:'+CASE);
  let s=await r.start();
  try{
    let x=await r.request(s,'POST','/lab/cases',{as:'owner',body:{
      input:r.caseInput(),operationId:'lab_op_case_http001'}});
    assert.equal(x.status,201);
    assert.equal(x.body.state,'submitted');
    assert.ok(!JSON.stringify(x.body).includes('vault:'));
    x=await r.request(s,'POST','/lab/evidence/'+CASE+'/'+EVIDENCE,{
      as:'owner',body:{fixtureCode:'FICTIONAL-UTILITY-001'}});
    assert.equal(x.status,201);
    assert.equal(x.body.encrypted,true);
    x=await r.request(s,'GET','/lab/evidence/'+CASE+'/'+EVIDENCE,{as:'reviewer'});
    assert.equal(x.body.fixture_code,'FICTIONAL-UTILITY-001');
    assert.equal(x.body.fictional,true);
    x=await r.request(s,'POST','/lab/cases/'+CASE+'/actions',{as:'reviewer',
      body:{event:{action:'begin_review'},expectedVersion:1,operationId:'lab_op_review_http001'}});
    assert.equal(x.body.state,'screening');
    x=await r.request(s,'POST','/lab/cases/'+CASE+'/actions',{as:'owner',
      body:{event:{action:'withdraw'},expectedVersion:2,operationId:'lab_op_withdraw_http001'}});
    assert.equal(x.body.state,'withdrawn');
    x=await r.request(s,'GET','/lab/evidence/'+CASE+'/'+EVIDENCE,{as:'reviewer'});
    assert.equal(x.status,401);
    assert.equal(x.body.error,'request_denied');
    x=await r.request(s,'GET','/lab/cases/'+CASE+'/public',{as:'owner'});
    assert.equal(x.status,401);
    await s.close();s=null;
    const restarted=await r.start();
    try{
      assert.equal((await r.request(restarted,'GET','/lab/cases/'+CASE+'/public',{as:'owner'})).status,401);
      assert.equal((await r.request(restarted,'GET','/lab/evidence/'+CASE+'/'+EVIDENCE,{as:'reviewer'})).status,401);
      const revoked=await r.request(restarted,'DELETE','/lab/evidence/'+CASE+'/'+EVIDENCE,{as:'owner'});
      assert.equal(revoked.body.revoked,true);
      assert.equal(revoked.body.secure_erase_proven,false);
    }finally{await restarted.close();}
  }finally{if(s)await s.close();}
});
test('cross-user request and forged role/body fields are blocked by signed identity and allowlists',async t=>{
  const r=await rig(t);
  r.grant('stranger','case.submit');
  const s=await r.start();
  try{
    let x=await r.request(s,'POST','/lab/cases',{as:'stranger',
      body:{input:r.caseInput(),operationId:'lab_op_spoof_http001'}});
    assert.equal(x.status,401);
    x=await r.request(s,'POST','/lab/cases',{as:'stranger',
      body:{input:r.caseInput(),actor:{id:'admin',role:'publisher'},
        operationId:'lab_op_spoof_http002'}});
    assert.equal(x.status,400);
    x=await r.request(s,'POST','/lab/cases',{as:'stranger',
      body:{input:{...r.caseInput(),private_account:'bad'},operationId:'lab_op_spoof_http003'}});
    assert.equal(x.status,401);
    assert.equal(x.body.error,'request_denied');
  }finally{await s.close();}
});
test('oversized and unrecognized inputs refused, no multipart upload or direct money endpoint',async t=>{
  const r=await rig(t),s=await r.start();
  try{
    let x=await r.request(s,'POST','/lab/cases',{as:'owner',
      headers:{'content-type':'multipart/form-data'},
      body:JSON.stringify({input:r.caseInput(),operationId:'lab_op_test_http001'})});
    assert.equal(x.status,415);
    x=await r.request(s,'POST','/lab/cases',{as:'owner',body:'x'.repeat(7000)});
    assert.equal(x.status,413);
    x=await r.request(s,'GET','/lab/evidence/'+CASE+'/../../etc/passwd',{as:'owner'});
    assert.notEqual(x.status,200);
  }finally{await s.close();}
});
test('fictional organization activation and suspension only after scoped Passport decisions',async t=>{
  const r=await rig(t);
  r.grant('applicant','partner.apply');
  r.grant('vetter','partner.review','lift:partner:'+PARTNER);
  r.grant('approver','partner.activate','lift:partner:'+PARTNER);
  r.grant('vetter','partner.suspend','lift:partner:'+PARTNER);
  const s=await r.start();
  try{
    let x=await r.request(s,'POST','/lab/partners',{as:'applicant',
      body:{input:r.partnerInput(),operationId:'lab_op_partner_http001'}});
    assert.equal(x.status,201);assert.equal(x.body.version,1);
    x=await r.request(s,'GET','/lab/partners/'+PARTNER+'/directory',{as:'applicant'});
    assert.equal(x.status,401);
    let version=1,n=0;
    async function change(who,event){
      const value=await r.request(s,'POST','/lab/partners/'+PARTNER+'/actions',{
        as:who,body:{event,expectedVersion:version,operationId:'lab_op_partner_step_'+(++n)}});
      if(value.status===200)version=value.body.version;
      return value;
    }
    x=await change('vetter',{action:'begin_review'});
    assert.equal(x.status,200);
    for(const kind of ['organization','program','contract']){
      x=await change('vetter',{action:'verify',check:kind,evidence_ref:'vault:lab_evidence_'+kind});
      assert.equal(x.status,200);
    }
    x=await change('approver',{action:'activate'});
    assert.equal(x.body.state,'active');
    x=await r.request(s,'GET','/lab/partners/'+PARTNER+'/directory',{as:'applicant'});
    assert.equal(x.status,200);
    assert.equal(x.body.capacity_confirmed,false);
    x=await change('vetter',{action:'suspend'});
    assert.equal(x.body.state,'suspended');
    x=await r.request(s,'GET','/lab/partners/'+PARTNER+'/directory',{as:'applicant'});
    assert.equal(x.status,401);
  }finally{await s.close();}
});
