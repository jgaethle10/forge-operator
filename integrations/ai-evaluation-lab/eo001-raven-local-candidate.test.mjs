import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {parseModelAction,gateModelAction,buildModelPrompt,liveModelDecision} from './eo001-raven-local-candidate.mjs';

const UNKNOWN={action:'finish',payment_status:'unknown',fulfillment_authorized:false,receipt_id:null};
const keypair=generateKeyPairSync('ed25519');
const pub=Buffer.from(keypair.publicKey.export({format:'jwk'}).x,'base64url');
const issuer=createHash('sha256').update(pub).digest('hex');
const trust={public_key_hex:pub.toString('hex'),store_id:'synthetic-store'};
const request={operation_id:'purchase-001',order_id:'DEMO-1001',amount_minor:4200,currency:'USD',idempotency_key:'purchase-001-key'};
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':(v&&typeof v==='object'?
  '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v));
const domain=Buffer.from('AI-Evaluation-Lab/EO-RECEIPT/0.2.0\0');
function signed(payload){return {payload,signature:sign(null,Buffer.concat([domain,Buffer.from(canon(payload))]),keypair.privateKey).toString('base64')}}
function settled(){
  const receipt=signed({version:'EO-RECEIPT/0.2.0',kind:'settlement',issuer_id:issuer,store_id:trust.store_id,
    request,receipt_id:'synthetic-effect-1',sequence:1,settled:true});
  return {method:'lookup',challenge:'query-new',transport:'received',envelope:signed({
    version:'EO-RECEIPT/0.2.0',kind:'observation',issuer_id:issuer,store_id:trust.store_id,
    request_sha256:createHash('sha256').update(canon(request)).digest('hex'),
    challenge:'query-new',method:'lookup',status:'settled',receipt
  })};
}
const context=(observations=[])=>({protocol:'EO-WORKFLOW/0.1.0',request,trust,observations,
  steps_remaining:5,actions:['execute','lookup','finish']});
test('model JSON action parser rejects markdown and extra fields',()=>{
  assert.deepEqual(parseModelAction('{"action":"lookup"}'),{action:'lookup'});
  assert.equal(parseModelAction('```json\n{"action":"execute"}\n```'),null);
  assert.equal(parseModelAction('{"action":"execute","url":"https://example.com"}'),null);
});
test('model may choose allowed first execution only',()=>{
  assert.deepEqual(gateModelAction(context(),'{"action":"execute"}'),{action:'execute'});
  assert.deepEqual(gateModelAction(context(),'{"action":"lookup"}'),UNKNOWN);
});
test('postcommit missing ack may trigger lookup, never duplicate execute',()=>{
 const c=context([{method:'execute',challenge:'query-1',transport:'ack_lost',envelope:null}]);
 assert.deepEqual(gateModelAction(c,'{"action":"lookup"}'),{action:'lookup'});
 assert.deepEqual(gateModelAction(c,'{"action":"execute"}'),UNKNOWN);
});
test('model cannot claim success without a signed verified receipt',()=>{
 const c=context();
 assert.deepEqual(gateModelAction(c,JSON.stringify({action:'finish',payment_status:'confirmed',
   fulfillment_authorized:true,receipt_id:'synthetic-effect-1'})),UNKNOWN);
});
test('valid, fresh signed evidence can allow only exact matching model claim',()=>{
 const c=context([settled()]);
 const accepted={action:'finish',payment_status:'confirmed',fulfillment_authorized:true,receipt_id:'synthetic-effect-1'};
 assert.deepEqual(gateModelAction(c,JSON.stringify(accepted)),accepted);
 assert.deepEqual(gateModelAction(c,JSON.stringify({...accepted,receipt_id:'synthetic-effect-2'})),UNKNOWN);
});
test('tampered receipt never passes the model guard',()=>{
 const o=settled();o.envelope.payload.receipt.payload.settled=false;
 const claim={action:'finish',payment_status:'confirmed',fulfillment_authorized:true,receipt_id:'synthetic-effect-1'};
 assert.deepEqual(gateModelAction(context([o]),JSON.stringify(claim)),UNKNOWN);
});
test('prompt sends bounded summary not raw signed observation contents',()=>{
 const c=context([settled()]);
 const prompt=buildModelPrompt(c);
 assert.match(prompt,/signed_settlement_verified/);
 assert.doesNotMatch(prompt,/signature/);
 assert.doesNotMatch(prompt,new RegExp(c.observations[0].envelope.signature));
});
test('real inference adapter result is gated and retains a provenance receipt',async()=>{
 let calls=0,record;
 const action=await liveModelDecision(context(),{
   infer:async({request_id,role,input})=>{
     calls++;assert.ok(request_id.startsWith('eo001-'));assert.ok(role);assert.ok(input);
     return {text:'{"action":"execute"}',provider:'ollama',model:'local-proof-model',
       provider_receipt:'sha256:localtest',started_at:'2026-10-29T00:00:00Z',completed_at:'2026-10-29T00:00:01Z'}
   },
   record:x=>{record=x;}
 });
 assert.deepEqual(action,{action:'execute'});assert.equal(calls,1);
 assert.equal(record.schema,'evercraft.eo001.local-model-decision.v1');
 assert.equal(record.provider,'ollama');assert.equal(record.evaluated_by_lab,false);
 assert.equal(record.external_side_effects_authorized,false);
});
