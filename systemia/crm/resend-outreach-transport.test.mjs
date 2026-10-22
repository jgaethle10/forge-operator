import test from 'node:test';
import assert from 'node:assert/strict';
import {createGovernedResendTransport,dispatchOwnedResendOutreach} from './resend-outreach-transport.mjs';

const id='sha256:'+'a'.repeat(64);
test('trusted Resend adapter uses worker sender, single verified recipient, and idempotency',async()=>{
 let calls=0;
 const send=createGovernedResendTransport({
  apiKey:'synthetic-private-key',from:'Evercraft <sender@example.invalid>',
  configuredSenderRef:'mailbox:verified',
  fetchImpl:async(url,options)=>{
   calls++;
   assert.equal(url,'https://api.resend.com/emails');
   assert.equal(options.headers['idempotency-key'],id);
   const json=JSON.parse(options.body);
   assert.deepEqual(json.to,['synthetic@example.invalid']);
   assert.equal(json.from,'Evercraft <sender@example.invalid>');
   assert.equal(json.subject,'Exactly approved subject');
   assert.equal(json.text,'Exactly approved body');
   return {ok:true,json:async()=>({id:'synthetic-provider-id'})};
  }
 });
 const res=await send({recipient:'synthetic@example.invalid',
  sender_ref:'mailbox:verified',subject:'Exactly approved subject',
  text:'Exactly approved body',idempotency_key:id});
 assert.deepEqual(res,{accepted:true,message_ref:'resend:synthetic-provider-id'});
 assert.equal(calls,1);
 await assert.rejects(send({recipient:'synthetic@example.invalid',sender_ref:'other',
  subject:'Another',text:'Payload',idempotency_key:id}),/invalid/);
 assert.equal(calls,1);
});
test('provider failure or missing message receipt is held, never treated as sent',async()=>{
 const base={apiKey:'synthetic-private-key',from:'sender@example.invalid',
  configuredSenderRef:'mailbox:owned'};
 const input={recipient:'synthetic@example.invalid',sender_ref:'mailbox:owned',
  subject:'Subject',text:'Body',idempotency_key:id};
 await assert.rejects(
  createGovernedResendTransport({...base,fetchImpl:async()=>({ok:false})})(input),
  /unconfirmed/);
 await assert.rejects(
  createGovernedResendTransport({...base,fetchImpl:async()=>({ok:true,json:async()=>({})})})(input),
  /receipt_unknown/);
});
test('owned entrypoint never touches provider without private identity and policy sources',async()=>{
 let calls=0;
 const result=await dispatchOwnedResendOutreach({
  action:{action_type:'send_email',subject_ref:'synthetic:contact'},
  recipientDirectoryFile:'/not-a-real-private-dir/recipients.json',
  relationshipLedgerFile:'/not-a-real-private-dir/relationships.json',
  approvalFile:'/not-a-real-private-dir/approval.json',
  keyFile:'/not-a-real-private-dir/key.bin',
  apiKey:'synthetic-private-key',from:'sender@example.invalid',
  configuredSenderRef:'mailbox:verified',
  fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({id:'impossible'})};}
 });
 assert.equal(result.state,'held');
 assert.equal(calls,0);
});
