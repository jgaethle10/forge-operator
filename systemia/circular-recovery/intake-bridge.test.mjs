import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {buildRecoveryCandidate,stageRecoveryResearch} from './intake-bridge.mjs';
test('real Intake Fabric: authorization, replay, changed-content rejection and independent work',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'circular-recovery-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dirs={intakeStateDir:path.join(root,'intake'),passportStateDir:path.join(root,'passport')};
 const actor='adapter:synthetic-recovery-proof';
 const at=new Date().toISOString();
 const record={id:'synthetic-plastic',stream:'plastic',pathway:'mechanical',
  evidence:[{source:'fixture',ref:'fixture:private-source',state:'modeled'}]};
 const input={...dirs,record,sourceDigest:'sha256:'+'a'.repeat(64),revision:1,dossierKey:'dossier:synthetic',adapterActorRef:actor,at};
 assert.throws(()=>stageRecoveryResearch(input),/recovery_intake_adapter_not_authorized/);
 const passport=new EvercraftPassport({stateDir:dirs.passportStateDir});
 passport.issueGrant({grant_id:'synthetic-recovery-agent',idempotency_key:'synthetic-recovery-grant',subject_ref:actor,
  issuer_ref:'evercraft:identity-authority',product:'evercraft-intake',scopes:['intake.write.agent'],
  starts_at:new Date(Date.now()-3600000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),
  authority_state:'verified_identity_authority',authority_receipt_ref:'identity:synthetic-proof'});
 const a=stageRecoveryResearch(input);
 assert.equal(a.state,'candidate_only');
 for(const k of ['admissionGranted','executionGranted','heartbeatConnected','dossierVerified','sourceCustodyVerified'])assert.equal(a[k],false);
 const b=stageRecoveryResearch(input);
 assert.equal(b.state,'duplicate');assert.equal(a.candidateId,b.candidateId);
 assert.throws(()=>stageRecoveryResearch({...input,sourceDigest:'sha256:'+'b'.repeat(64)}),/recovery_intake_binding_conflict/);
 assert.throws(()=>stageRecoveryResearch({...input,adapterActorRef:'adapter:unauthorized-replay'}),/recovery_intake_adapter_not_authorized/);
 const next=stageRecoveryResearch({...input,revision:2});
 assert.notEqual(next.candidateId,a.candidateId);
 const other=stageRecoveryResearch({...input,record:{...record,id:'synthetic-tire',stream:'tire'}});
 assert.notEqual(other.candidateId,a.candidateId);
 const candidates=fs.readFileSync(path.join(dirs.intakeStateDir,'candidates.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(candidates.length,3);
 assert.ok(candidates.every(c=>c.execution_authority_granted===false&&c.external_side_effects_authorized===false));
 assert.ok(!JSON.stringify(candidates).includes('fixture:private-source'));
 assert.throws(()=>buildRecoveryCandidate({...input,record:{...record,evidence:[]}}),/recovery_record_evidence_required/);
});
