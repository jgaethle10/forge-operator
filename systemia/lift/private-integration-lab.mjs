/**
 * Evercraft Lift private integration LAB v0.4.
 *
 * No network listener, no actual recipients, no identity enrollment, no real
 * evidence documents or financial flows. This composes existing authenticated
 * Identity / Passport decisions with a synthetic-only single-writer event store
 * and a fictional AES-GCM evidence vault.
 */
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {createLiftIdentityBoundary,liftSubjectActorId} from './identity-boundary.mjs';
import {openLiftLabJournal} from './lab-journal.mjs';
import {openLiftEvidenceVaultLab} from './evidence-vault-lab.mjs';

const CASE_ROLE=Object.freeze({
  begin_review:'reviewer',verify:'reviewer',approve_private:'reviewer',
  reject:'reviewer',reopen:'reviewer',set_redacted_preview:'reviewer',
  publish:'publisher',pause:'reviewer',consent_public:'requester',
  withdraw:'requester',
});
const PARTNER_ROLE=Object.freeze({
  begin_review:'partner_reviewer',verify:'partner_reviewer',
  reject:'partner_reviewer',activate:'partner_approver',suspend:'partner_reviewer',
});
const fail=(why)=>{throw new Error('lift_private_lab_blocked:'+why)};
function authenticatedActor({token,identity,keyring,now,role}){
  const at=now===undefined?new Date():new Date(now);
  if(!Number.isFinite(at.getTime()))fail('invalid_clock');
  const verified=verifyEvercraftSession(token,keyring,{now:at});
  identity.assertSessionActive(verified);
  return {id:liftSubjectActorId(verified.subject_ref),role};
}
function summary(result){
  return Object.freeze({
    duplicate:Boolean(result.duplicate),
    version:result.version??result.current_version,
    state:result.state.status,
    id:result.state.id,
    // No private vault identifiers or applicant evidence are returned.
    fictional:true,payments_enabled:false,
  });
}
export async function openLiftPrivateIntegrationLab({
  journalDirectory,vaultDirectory,vaultMasterKey,identity,passport,keyring,
}={}){
  if(!identity||!passport||!keyring)fail('trusted_identity_and_passport_required');
  const journal=await openLiftLabJournal(journalDirectory);
  let vault;
  try{
    vault=await openLiftEvidenceVaultLab({
      directory:vaultDirectory,masterKey:vaultMasterKey,identity,passport,keyring,
      loadCase:(id)=>journal.get('case',id)?.state??null,
    });
  }catch(error){
    await journal.close().catch(()=>{});
    throw error;
  }
  const guard=createLiftIdentityBoundary({
    identity,passport,keyring,
    loadCase:(id)=>journal.get('case',id)?.state??null,
    loadPartner:(id)=>journal.get('partner',id)?.state??null,
  });
  let closed=false;
  const requireOpen=()=>{if(closed)fail('service_closed')};
  const actor=(token,role,now)=>authenticatedActor({token,identity,keyring,role,now});
  function sameTransition(planned,actual){
    // The final state must match the one authorized by the Identity/Passport
    // adapter; journal compare-and-swap makes stale planning fail closed.
    if(!planned||!actual||JSON.stringify(planned)!==JSON.stringify(actual))
      fail('authorized_state_mismatch');
  }
  return Object.freeze({
    createCase:async({token,input,operationId,now}={})=>{
      requireOpen();
      const planned=guard.submitCase({token,input,now});
      const a=actor(token,'requester',now);
      const result=await journal.createCase({input,actor:a,operationId});
      if(!result.duplicate)sameTransition(planned,result.state);
      return summary(result);
    },
    transitionCase:async({token,id,event,operationId,expectedVersion,now}={})=>{
      requireOpen();
      if(!event||!Object.hasOwn(CASE_ROLE,event.action))fail('unsupported_case_action');
      const planned=guard.changeCase({token,id,event,now});
      const a=actor(token,CASE_ROLE[event.action],now);
      const result=await journal.transitionCase({id,event,actor:a,operationId,expectedVersion});
      if(!result.duplicate)sameTransition(planned,result.state);
      return summary(result);
    },
    createPartner:async({token,input,operationId,now}={})=>{
      requireOpen();
      const planned=guard.submitPartner({token,input,now});
      const a=actor(token,'partner_applicant',now);
      const result=await journal.createPartner({input,actor:a,operationId});
      if(!result.duplicate)sameTransition(planned,result.state);
      return summary(result);
    },
    transitionPartner:async({token,id,event,operationId,expectedVersion,now}={})=>{
      requireOpen();
      if(!event||!Object.hasOwn(PARTNER_ROLE,event.action))fail('unsupported_partner_action');
      const planned=guard.changePartner({token,id,event,now});
      const a=actor(token,PARTNER_ROLE[event.action],now);
      const result=await journal.transitionPartner({id,event,actor:a,operationId,expectedVersion});
      if(!result.duplicate)sameTransition(planned,result.state);
      return summary(result);
    },
    putFixtureEvidence:async(request)=>{
      requireOpen();
      return vault.put(request);
    },
    readFixtureEvidence:async(request)=>{
      requireOpen();
      return vault.get(request);
    },
    revokeFixtureEvidence:async(request)=>{
      requireOpen();
      return vault.revoke(request);
    },
    // Public snapshot functions use canonical privacy allowlists and are
    // blocked for never-published/withdrawn cases and suspended partners.
    publicCase:(id)=>{requireOpen();return journal.getPublicCase(id)},
    publicPartner:(id)=>{requireOpen();return journal.getDirectoryPartner(id)},
    labHealth:()=>({lab_only:true,real_data_allowed:false,payments_enabled:false,
      journal:journal.journalStatus()}),
    close:async()=>{
      if(closed)return;
      closed=true;
      // Either closure failure must be surfaced; never silently reuse a lock.
      let first;
      try{await vault.close();}catch(e){first=e;}
      try{await journal.close();}catch(e){if(!first)first=e;}
      if(first)throw first;
    },
  });
}
