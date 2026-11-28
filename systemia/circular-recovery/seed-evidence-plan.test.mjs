import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {emptyTowiState,admitRadarEdition,addEvidenceToDossier} from '../towi/core.mjs';
import {prepareRecoveryEvidence} from './seed-evidence-plan.mjs';
const digest=d=>'sha256:'+createHash('sha256').update(JSON.stringify(d)).digest('hex');
test('existing TOWI state can receive real public-source context only through explicit owner review',()=>{
 const at='2026-11-27T18:00:00Z',subject='synthetic::orchard';
 const signal={signal_id:'radar:fixture',subject_key:subject,observation_id:'obs:fixture',observed_at:at,
 last_verified_at:at,summary:'Fixture only',truth_state:'PENDING',change_state:'NEW',
 materiality_score:0.8,reliability:0.5,domains:['environment'],source_family:'fixture',
 provenance_refs:['https://example.org/fixture'],review:{status:'pass',independent_source_families:1,
 freshness:{state:'fresh'},warnings:[]},observation:{facts:{}}};
 let state=admitRadarEdition(emptyTowiState(),{edition_id:'radar:fixture',signals:[signal],rolled_off_signals:[]},{now:at}).state;
 const dossierId=Object.keys(state.dossiers)[0],d=()=>state.dossiers[dossierId];
 const options=()=>({seedId:'cr-003-biomass',towiResident:{dossier:()=>d()},dossierId,
 expectedDossierDigest:digest(d()),expectedSubjectKey:subject});
 const before=digest(d()),plan=prepareRecoveryEvidence(options());
 assert.equal(plan.pendingEvidence.length,2);
 assert.equal(plan.distinctReportedAgencyFamilies,1);
 assert.equal(plan.independentCorroborationVerified,false);
 assert.equal(plan.publicationAuthority,false);
 assert.equal(digest(d()),before);
 assert.ok(plan.pendingEvidence.every(x=>x.evidence_state==='reported'&&x.relationship==='context'));
 assert.throws(()=>prepareRecoveryEvidence({...options(),expectedSubjectKey:'other'}),/binding_required/);
 assert.throws(()=>prepareRecoveryEvidence({...options(),expectedDossierDigest:'sha256:'+'0'.repeat(64)}),/revision_mismatch/);
 for(const evidence of plan.pendingEvidence){
  const added=addEvidenceToDossier(state,dossierId,evidence,{now:at});
  assert.equal(added.receipt.publication_authority,false);
  state=added.state;
 }
 const replay=prepareRecoveryEvidence(options());
 assert.equal(replay.pendingEvidence.length,0);
 assert.equal(replay.alreadyPresent,2);
 assert.equal(d().publication_authority,false);
});
