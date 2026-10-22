import {dispatchGovernedEmail} from './governed-mail-adapter.mjs';
import {createPrivateEmailRecipientResolver} from './private-recipient-directory.mjs';

const ENDPOINT='https://api.resend.com/emails';
const req=(x,n)=>{if(typeof x!=='string'||!x.trim())throw Error(n+'_required');return x.trim();};
/**
 * Provider adapter is created in the trusted worker. It does not accept a
 * recipient mailbox or API credential from an agent's outbound request.
 */
export function createGovernedResendTransport({
 apiKey,from,configuredSenderRef,fetchImpl=fetch
}={}){
 const key=req(apiKey,'resend_key'),fromMailbox=req(from,'resend_from');
 const senderRef=req(configuredSenderRef,'sender_ref');
 if(!fromMailbox.includes('@')||typeof fetchImpl!=='function')throw Error('resend_transport_invalid');
 return async function send(reqInput){
  if(reqInput?.sender_ref!==senderRef||
     !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(reqInput?.recipient||'')||
     !reqInput?.subject||!reqInput?.text||
     !/^sha256:[a-f0-9]{64}$/.test(reqInput?.idempotency_key||''))
    throw Error('governed_mail_provider_input_invalid');
  const response=await fetchImpl(ENDPOINT,{
   method:'POST',headers:{
     authorization:'Bearer '+key,'content-type':'application/json',
     'idempotency-key':reqInput.idempotency_key
   },body:JSON.stringify({
     from:fromMailbox,to:[reqInput.recipient],
     subject:reqInput.subject,text:reqInput.text
   })
  });
  if(!response?.ok)throw Error('resend_provider_unconfirmed');
  const payload=await response.json();
  if(typeof payload?.id!=='string'||!payload.id.trim())
    throw Error('resend_provider_receipt_unknown');
  return {accepted:true,message_ref:'resend:'+payload.id.trim()};
 };
}
/**
 * Private-only production integration surface. No caller callback can replace
 * recipient discovery, human approval verification, or sender configuration.
 * This is an opt-in adapter, not a globally installed transport.
 */
export async function dispatchOwnedResendOutreach({
 action={},relationshipLedgerFile='',approvalFile='',keyFile='',
 recipientDirectoryFile='',interactionLedger=null,outboxDir='',
 apiKey='',from='',configuredSenderRef='',fetchImpl=fetch,now=new Date()
}={}){
 let resolveRecipient,sendProvider;
 try{
  resolveRecipient=createPrivateEmailRecipientResolver({recipientDirectoryFile,now});
  sendProvider=createGovernedResendTransport({apiKey,from,configuredSenderRef,fetchImpl});
 }catch{
  return {schema:'evercraft.crm.governed-mail-result.v1',state:'held',
    reason:'trusted_private_transport_unavailable',message_sent:false,
    provider_accepted:false,automatic_retry:false};
 }
 return dispatchGovernedEmail({action,relationshipLedgerFile,approvalFile,keyFile,
  interactionLedger,outboxDir,resolveRecipient,sendProvider,now});
}
