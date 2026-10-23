import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {prepareContactWithPrivateAuthority} from './private-approvals.mjs';

const hash=x=>'sha256:'+createHash('sha256').update(String(x)).digest('hex');
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const hold=reason=>{
  const ambiguous=['provider_result_unknown','provider_accepted_reconciliation_required'].includes(reason);
  return {schema:'evercraft.crm.governed-mail-result.v1',state:'held',
    reason,message_sent:ambiguous?null:false,
    provider_accepted:reason==='provider_accepted_reconciliation_required'?true:ambiguous?null:false,
    delivery_confirmed:false,automatic_retry:false};
};
const privateDir=dir=>{
  const s=fs.lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)!==0))
    throw Error('directory_unsafe');
};
const readState=file=>{
  try{
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    try{
      const st=fs.fstatSync(fd);
      if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0)||
         st.size>2*1024*1024)throw Error('outbox_unsafe');
      const state=JSON.parse(fs.readFileSync(fd,'utf8'));
      if(state?.schema!=='evercraft.crm.governed-outbox.v1'||!Array.isArray(state.attempts)||
         state.attempts.length>10000)throw Error('outbox_invalid');
      return state;
    }finally{fs.closeSync(fd);}
  }catch(e){
    if(e?.code==='ENOENT')return {schema:'evercraft.crm.governed-outbox.v1',attempts:[]};
    throw e;
  }
};
const persist=(file,state)=>{
  const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
  try{
    const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
    try{fs.writeFileSync(fd,JSON.stringify(state)+'\n');fs.fsyncSync(fd);}
    finally{fs.closeSync(fd);}
    fs.renameSync(temp,file);
    const dirFd=fs.openSync(path.dirname(file),fs.constants.O_RDONLY);
    try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
  }finally{try{fs.unlinkSync(temp);}catch{}}
};
const change=(dir,id,fn)=>{
  privateDir(dir);
  const lock=path.join(dir,'.governed-mail-lock');
  fs.mkdirSync(lock,{mode:0o700}); // no stale lock break: safe hold over duplicate send
  try{
    const file=path.join(dir,'outbox.json'),state=readState(file);
    const existing=state.attempts.find(a=>a.id===id);
    const result=fn(existing,state);
    if(result?.write)persist(file,state);
    return result?.value;
  }finally{fs.rmdirSync(lock);}
};
const status=(dir,id,kind,receipt)=>{
  return change(dir,id,(existing)=>{
    if(!existing)throw Error('outbox_reservation_missing');
    if(!['reserved','provider_accepted_unreconciled'].includes(existing.state))
      throw Error('outbox_state_invalid');
    existing.state=kind;
    if(receipt)existing.provider_receipt_digest=hash(receipt);
    existing.updated_at=new Date().toISOString();
    return {write:true,value:true};
  });
};
/**
 * Owner-only adapter for discretionary one-recipient EMAIL. No live provider is
 * configured here. Worker supplies trusted recipient lookup and provider sender.
 * Any unresolved outcome is parked for manual provider reconciliation, not retried.
 */
export async function dispatchGovernedEmail({
  action={},relationshipLedgerFile='',approvalFile='',keyFile='',
  interactionLedger=null,outboxDir='',resolveRecipient=null,sendProvider=null,
  now=new Date()
}={}){
  if(action.action_type!=='send_email'||!nonempty(action.subject_ref)||
     action.target_ref!==action.subject_ref||!nonempty(action.email_subject)||
     !nonempty(action.sender_ref)||!nonempty(action.exact_content)||
     !Array.isArray(action.recipient_refs)||action.recipient_refs.length!==1||
     action.recipient_refs[0]!==action.subject_ref||
     (Array.isArray(action.cc_refs)&&action.cc_refs.length>0)||
     (Array.isArray(action.bcc_refs)&&action.bcc_refs.length>0)||
     action.attachments_sha256||action.to||action.cc||action.bcc)
    return hold('unsupported_or_ambiguous_mail_envelope');
  if(typeof resolveRecipient!=='function'||typeof sendProvider!=='function')
    return hold('trusted_transport_not_configured');
  if(!outboxDir)return hold('private_outbox_unavailable');
  const fingerprint=fingerprintExternalAction(action);
  // Deterministic across new agent-supplied permit IDs: same approved action == same delivery attempt.
  const attempt=hash('governed-email-v1|'+fingerprint);
  let recipient;
  try{
    recipient=await resolveRecipient({subject_ref:action.subject_ref,division_id:action.division_id});
  }catch{return hold('recipient_resolution_failed');}
  if(!recipient||recipient.verified!==true||
     recipient.subject_ref!==action.subject_ref||!nonempty(recipient.mailbox)||
     !nonempty(recipient.evidence_ref))return hold('recipient_mapping_not_verified');

  const gate=await prepareContactWithPrivateAuthority({
    action,relationshipLedgerFile,interactionLedger,approvalFile,keyFile,now
  });
  if(gate.decision!=='permit_ready'||!gate.permit?.permit_id)
    return hold('outreach_not_authorized');

  // Active Passport state must be rechecked against the complete exact-action
  // fingerprint. In particular, duplicate mint may return a consumed permit.
  let permitState;
  try{permitState=interactionLedger.passport.getActionPermitState(gate.permit.permit_id,{
    at:now.toISOString()
  });}catch{return hold('permit_status_unavailable');}
  if(!permitState.active||permitState.request_fingerprint!==fingerprint||
     permitState.resource_ref!==action.subject_ref)return hold('permit_inactive_or_mismatched');

  // Reserve BEFORE sending. If process crashes, the durable reservation
  // intentionally prevents automated retry even if provider state is unknown.
  try{
    const result=change(path.resolve(outboxDir),attempt,(existing,state)=>{
      if(existing)return {write:false,value:'already_reserved'};
      state.attempts.push({id:attempt,action_fingerprint:fingerprint,
        permit_digest:hash(gate.permit.permit_id),state:'reserved',
        created_at:now.toISOString(),updated_at:now.toISOString()});
      return {write:true,value:'reserved'};
    });
    if(result!=='reserved')return hold('previous_attempt_requires_reconciliation');
  }catch{return hold('outbox_reservation_failed');}

  let provider;
  try{
    provider=await sendProvider({
      recipient:recipient.mailbox,
      sender_ref:action.sender_ref,
      subject:action.email_subject,
      text:action.exact_content,
      idempotency_key:attempt,
      action_fingerprint:fingerprint
    });
    if(provider?.accepted!==true||!nonempty(provider.message_ref))
      return hold('provider_result_unknown');
  }catch{return hold('provider_result_unknown');}

  try{status(path.resolve(outboxDir),attempt,'provider_accepted_unreconciled',provider.message_ref);}
  catch{return hold('provider_accepted_reconciliation_required');}

  try{
    const completed=interactionLedger.finalizePermittedContact({
      subject_ref:action.subject_ref,channel:'email',actor_ref:action.actor_ref,
      content_fingerprint:fingerprint,permit_id:gate.permit.permit_id,
      provider_evidence_ref:provider.message_ref,occurred_at:new Date().toISOString(),
      permit_consumption_idempotency_key:'consume:'+attempt,
      interaction_idempotency_key:'outbound:'+attempt
    });
    if(completed?.state!=='finalized')throw Error('interaction_finalization_incomplete');
    status(path.resolve(outboxDir),attempt,'finalized',provider.message_ref);
    return {schema:'evercraft.crm.governed-mail-result.v1',
      state:'provider_accepted_and_recorded',message_sent:null,
      provider_accepted:true,delivery_confirmed:false,automatic_retry:false,
      provider_receipt_digest:hash(provider.message_ref)};
  }catch{return hold('provider_accepted_reconciliation_required');}
}
