/**
 * Evercraft Lift v0.3 identity/Passport adapter.
 *
 * Integration proof only. No HTTP endpoints, account enrollment, private storage,
 * file handling, fund collection or real recipients. Callers MUST provide protected
 * loadCase/loadPartner functions returning authoritative latest records. Never
 * supply those loaders from untrusted HTTP input or a public cache.
 */
import {createHash} from 'node:crypto';
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {makeCase, transitionCase, makePartner, transitionPartner} from './review-workflow.mjs';

const PRODUCT='evercraft-lift';
const IDENT=/^[A-Za-z0-9_-]{3,64}$/;
const CASE_ACTIONS=Object.freeze({
  begin_review:['case.review','reviewer'],
  verify:['case.review','reviewer'],
  approve_private:['case.review','reviewer'],
  reject:['case.review','reviewer'],
  reopen:['case.review','reviewer'],
  set_redacted_preview:['case.redact','reviewer'],
  publish:['case.publish','publisher'],
  pause:['case.pause','reviewer'],
  consent_public:['case.consent','requester'],
  withdraw:['case.withdraw','requester'],
});
const PARTNER_ACTIONS=Object.freeze({
  begin_review:['partner.review','partner_reviewer'],
  verify:['partner.review','partner_reviewer'],
  reject:['partner.review','partner_reviewer'],
  activate:['partner.activate','partner_approver'],
  suspend:['partner.suspend','partner_reviewer'],
});
const PRIVILEGED_CASE_ACTIONS=new Set(['begin_review','verify','approve_private','reject','reopen','set_redacted_preview','publish','pause']);
const OWNER_CASE_ACTIONS=new Set(['consent_public','withdraw']);
const isRecord=(value)=>value&&typeof value==='object'&&!Array.isArray(value);
const error=(reason)=>{throw new Error('lift_authority_denied:'+reason)};
export function liftSubjectActorId(subjectRef){
  if(typeof subjectRef!=='string'||!subjectRef.trim())error('subject_missing');
  return 'lift_actor_'+createHash('sha256').update('evercraft-lift.actor.v1\0'+subjectRef).digest('hex').slice(0,40);
}
function identifier(value){
  if(!IDENT.test(value||''))error('invalid_resource_id');
  return value;
}
function scopedResource(kind,id){
  return 'lift:'+kind+':'+identifier(id);
}
export function createLiftIdentityBoundary({identity,passport,keyring,loadCase,loadPartner}={}){
  if(!identity||typeof identity.assertSessionActive!=='function'||
     !passport||typeof passport.authorize!=='function'||typeof passport.getGrantState!=='function'||
     !keyring||typeof loadCase!=='function'||typeof loadPartner!=='function')
    error('trusted_identity_passport_and_loaders_required');

  function sessionFor(token,at){
    if(typeof token!=='string'||!token||token.length>12000)error('session_missing_or_oversized');
    // Signed identity verification runs on every call. Static token claims do not
    // substitute for revocation checks against the authoritative Identity store.
    const session=verifyEvercraftSession(token,keyring,{now:new Date(at)});
    identity.assertSessionActive(session);
    return session;
  }
  function authorize(session,scope,resource,at,requireExactResource){
    const decision=passport.authorize({
      subject_ref:session.subject_ref,product:PRODUCT,scope,
      resource_ref:resource||undefined,at,
    });
    if(decision.decision!=='allow'||!decision.grant_id)error('passport_scope_missing');
    if(requireExactResource){
      // Passport permits global scopes; Lift deliberately requires per-resource
      // reviewer/publisher grants, not portfolio-wide broad authority.
      const grant=passport.getGrantState(decision.grant_id,{at});
      if(!grant.active||grant.product!==PRODUCT||
         !Array.isArray(grant.resource_refs)||!grant.resource_refs.includes(resource))
        error('case_specific_grant_required');
    }
    return decision;
  }
  function nowIso(now){
    const d=now===undefined?new Date():new Date(now);
    if(!Number.isFinite(d.getTime()))error('invalid_clock');
    return d.toISOString();
  }
  function caseRecord(id){
    const record=loadCase(identifier(id));
    if(!isRecord(record)||record.id!==id||record.schema!=='evercraft.lift.case-workflow.v1')
      error('case_not_found');
    return record;
  }
  function partnerRecord(id){
    const record=loadPartner(identifier(id));
    if(!isRecord(record)||record.id!==id||record.schema!=='evercraft.lift.partner-workflow.v1')
      error('partner_not_found');
    return record;
  }
  return Object.freeze({
    submitCase({token,input,now}={}){
      const at=nowIso(now),session=sessionFor(token,at);
      if(!isRecord(input))error('invalid_case_input');
      const actor={id:liftSubjectActorId(session.subject_ref),role:'requester'};
      if(input.owner_id!==actor.id)error('case_owner_mismatch');
      authorize(session,'case.submit',null,at,false);
      return makeCase(input,actor);
    },
    changeCase({token,id,event,now}={}){
      const at=nowIso(now),session=sessionFor(token,at);
      if(!isRecord(event)||typeof event.action!=='string')error('invalid_action');
      const config=CASE_ACTIONS[event.action];
      if(!config)error('unsupported_case_action');
      const record=caseRecord(id);
      const actor={id:liftSubjectActorId(session.subject_ref),role:config[1]};
      if(OWNER_CASE_ACTIONS.has(event.action)&&record.owner_id!==actor.id)
        error('case_not_owned');
      const resource=scopedResource('case',id);
      authorize(session,config[0],resource,at,PRIVILEGED_CASE_ACTIONS.has(event.action));
      return transitionCase(record,event,actor);
    },
    submitPartner({token,input,now}={}){
      const at=nowIso(now),session=sessionFor(token,at);
      if(!isRecord(input))error('invalid_partner_input');
      const actor={id:liftSubjectActorId(session.subject_ref),role:'partner_applicant'};
      if(input.owner_id!==actor.id)error('partner_owner_mismatch');
      authorize(session,'partner.apply',null,at,false);
      return makePartner(input,actor);
    },
    changePartner({token,id,event,now}={}){
      const at=nowIso(now),session=sessionFor(token,at);
      if(!isRecord(event)||typeof event.action!=='string')error('invalid_action');
      const config=PARTNER_ACTIONS[event.action];
      if(!config)error('unsupported_partner_action');
      const record=partnerRecord(id);
      const actor={id:liftSubjectActorId(session.subject_ref),role:config[1]};
      authorize(session,config[0],scopedResource('partner',id),at,true);
      return transitionPartner(record,event,actor);
    },
  });
}
