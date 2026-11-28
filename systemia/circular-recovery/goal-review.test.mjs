import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createTowiResident} from '../towi/resident.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {stageTowiRecoveryResearch} from './towi-bridge.mjs';
import {runAdmittedRecoveryReview} from './goal-review.mjs';
import {bindRecoveryContinuity} from './continuity-bridge.mjs';
import {matchGoalReceipt} from '../organism/kaidance-rd-continuity.mjs';
import {readGoalState} from '../organism/goal-store.mjs';
test('existing TOWI, Passport, Intake and durable dispatch: accepted review completes once',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'circular-goal-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=name=>{const p=path.join(root,name);fs.mkdirSync(p,{mode:0o700});return p};
 const intakeStateDir=dir('intake'),passportStateDir=dir('passport'),outDir=dir('goals');
 const at=new Date().toISOString(),adapterActorRef='adapter:synthetic-recovery',readerActorRef='adapter:synthetic-reader';
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 for(const [actor,scopes] of [[adapterActorRef,['intake.write.agent']],[readerActorRef,['intake.read','intake.admit']]]){
  passport.issueGrant({grant_id:actor,idempotency_key:actor,subject_ref:actor,
   issuer_ref:'evercraft:identity-authority',product:'evercraft-intake',scopes,
   starts_at:new Date(Date.now()-3600000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),
   authority_state:'verified_identity_authority',authority_receipt_ref:'identity:synthetic-proof'});
 }
 const towiResident=createTowiResident({stateDir:dir('towi'),clock:()=>new Date(at)});
 const signal={signal_id:'radar:synthetic-recovery',subject_key:'synthetic::plastic',observation_id:'obs:synthetic',
 observed_at:at,last_verified_at:at,summary:'Synthetic material recovery question',truth_state:'REPORTED',
 change_state:'NEW',materiality_score:0.9,reliability:0.8,domains:['environment'],region_keys:['synthetic'],
 source_family:'fixture-radar',provenance_refs:['https://example.org/radar'],
 review:{status:'pass',independent_source_families:1,freshness:{state:'fresh'},warnings:[]},observation:{facts:{}}};
 assert.equal((await towiResident.runOnce({radarEdition:{edition_id:'radar:synthetic-recovery',signals:[signal],rolled_off_signals:[]}})).status,'pass');
 const dossierId=towiResident.queue()[0].dossier_id;
 towiResident.addEvidence(dossierId,{source_family:'fixture-lab',independence_group:'fixture-lab',
 observed_at:at,evidence_state:'modeled',relationship:'context',summary:'Synthetic model',provenance_refs:['https://example.org/model']});
 const expectedDossierDigest='sha256:'+createHash('sha256').update(JSON.stringify(towiResident.dossier(dossierId))).digest('hex');
 const record={id:'synthetic-plastic',stream:'plastic',pathway:'mechanical',
 evidence:[{source:'fixture-lab',ref:'https://example.org/model',state:'modeled'}]};
 const opts={towiResident,dossierId,expectedDossierDigest,record,revision:1,adapterActorRef,readerActorRef,intakeStateDir,passportStateDir,outDir};
 const stage=stageTowiRecoveryResearch(opts),candidateId=stage.candidateId;
 await assert.rejects(runAdmittedRecoveryReview({...opts,candidateId}),/candidate_not_accepted/);
 assert.equal(fs.readdirSync(outDir).length,0);
 const intake=new EvercraftIntakeFabric({stateDir:intakeStateDir,passportStateDir});
 intake.decideAdmission({idempotency_key:'synthetic-admission',candidate_id:candidateId,decision:'accept',
 actor_ref:readerActorRef,mission_ref:'circular-recovery-research',reason:'Synthetic desktop proof only',evidence_ref:expectedDossierDigest});
 const result=await runAdmittedRecoveryReview({...opts,candidateId});
 assert.equal(result.completedDesktopReview,true);assert.equal(result.executedThisCall,true);
 assert.equal(result.screen.stage,'research_gaps');assert.equal(result.attempt,1);
 const goalState=await readGoalState(path.join(outDir,result.goalKey+'.json'));
 const mission={mission_id:'circular-recovery-research',admission_state:'admitted',disposition:'active'};
 const crosswalk={mission,goalState,review:result,stateDirectoryName:'goals'};
 const row=bindRecoveryContinuity(crosswalk);
 assert.equal(matchGoalReceipt(row,goalState),'completed_work_checkpoint_matched');
 assert.equal(row.goal_binding.state_relpath,'goals/'+result.goalKey+'.json');
 assert.throws(()=>bindRecoveryContinuity({...crosswalk,mission:{...mission,admission_state:'proposed'}}),/requires_existing_admitted_mission/);
 assert.throws(()=>bindRecoveryContinuity({...crosswalk,review:{...result,screenReceiptRef:'sha256:'+'0'.repeat(64)}}),/checkpoint_not_matched/);

 for(const k of ['heartbeatConnected','physicalExecution','environmentalClaimVerified','commercialCommitment','publicationAuthority'])assert.equal(result[k],false);
 const replay=await runAdmittedRecoveryReview({...opts,candidateId});
 assert.equal(replay.executedThisCall,false);assert.equal(replay.attempt,1);assert.equal(replay.screenReceiptRef,result.screenReceiptRef);
 await assert.rejects(runAdmittedRecoveryReview({...opts,candidateId,readerActorRef:'adapter:denied'}),/intake_read_not_authorized/);
 await assert.rejects(runAdmittedRecoveryReview({...opts,candidateId,revision:2}),/recovery_admission_binding_conflict/);
 assert.equal(fs.readdirSync(outDir).length,1);
 assert.equal(towiResident.health().resident,false);
});
