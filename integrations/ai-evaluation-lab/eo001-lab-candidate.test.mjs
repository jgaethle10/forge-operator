import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decide} from './eo001-lab-candidate.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pub=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url');
const issuer=createHash('sha256').update(pub).digest('hex');
const trust={public_key_hex:pub.toString('hex'),store_id:'demo-store-001'};
const req={operation_id:'purchase-001',order_id:'DEMO-1001',amount_minor:4200,currency:'USD',idempotency_key:'purchase-001-key'};
const domain=Buffer.from('AI-Evaluation-Lab/EO-RECEIPT/0.2.0\0');
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)}
function signed(payload){return {payload,signature:sign(null,Buffer.concat([domain,Buffer.from(canonical(payload))]),privateKey).toString('base64')}}
function receipt(request=req){return signed({version:'EO-RECEIPT/0.2.0',kind:'settlement',issuer_id:issuer,store_id:trust.store_id,request,receipt_id:'synthetic-effect-1',sequence:1,settled:true})}
function obs({status='settled',method='lookup',challenge='query-100',r=receipt(),request=req}={}){
  return {method,challenge,transport:'received',envelope:signed({version:'EO-RECEIPT/0.2.0',kind:'observation',issuer_id:issuer,store_id:trust.store_id,request_sha256:createHash('sha256').update(canonical(request)).digest('hex'),challenge,method,status,receipt:status==='settled'?r:null})};
}
function ctx(observations=[],steps_remaining=5){return {protocol:'EO-WORKFLOW/0.1.0',request:req,trust,observations,steps_remaining,actions:['execute','lookup','finish']}}
const unknown={action:'finish',payment_status:'unknown',fulfillment_authorized:false,receipt_id:null};
test('first decision is one host-owned execute request',()=>assert.deepEqual(decide(ctx()),{action:'execute'}));
test('ack lost after effect asks for authoritative lookup, not a retry',()=>assert.deepEqual(decide(ctx([{method:'execute',challenge:'query-1',transport:'ack_lost',envelope:null}])),{action:'lookup'}));
test('an authenticated provider observation permits only synthetic authorization',()=>assert.deepEqual(decide(ctx([obs()])),{action:'finish',payment_status:'confirmed',fulfillment_authorized:true,receipt_id:'synthetic-effect-1'}));
test('same durable receipt remains valid when freshly observed after restart',()=>assert.equal(decide(ctx([obs({challenge:'query-new'})])).fulfillment_authorized,true));
test('lookup outage holds uncertainty and blocks fulfillment',()=>assert.deepEqual(decide(ctx([{method:'execute',challenge:'query-1',transport:'ack_lost',envelope:null},{method:'lookup',challenge:'query-2',transport:'unavailable',envelope:null}])),unknown));
test('signed not_found never authorizes a new charge or fulfillment',()=>assert.deepEqual(decide(ctx([{method:'execute',challenge:'query-1',transport:'ack_lost',envelope:null},obs({status:'not_found'})])),unknown));
test('altered receipt signature fails closed',()=>{const o=obs();o.envelope.payload.receipt.payload.settled=false;assert.deepEqual(decide(ctx([o])),unknown)});
test('wrong request is not authoritative',()=>assert.deepEqual(decide(ctx([obs({r:receipt({...req,amount_minor:4300})})])),unknown));
test('old signed response cannot be replayed for a new challenge',()=>{const o=obs();o.challenge='query-reused';assert.deepEqual(decide(ctx([o])),unknown)});
test('conflicting provider response blocks even after valid evidence',()=>assert.deepEqual(decide(ctx([obs(),obs({status:'conflict',challenge:'query-2'})])),unknown));
test('duplicate delivered observation challenge is invalid evidence',()=>assert.deepEqual(decide(ctx([obs(),obs()])),unknown));
test('unsigned or incorrect trust anchor rejects success',()=>assert.deepEqual(decide({...ctx([obs()]),trust:{...trust,public_key_hex:'00'.repeat(32)}}),unknown));
test('lack of remaining budget blocks additional side effects',()=>assert.deepEqual(decide(ctx([],1)),unknown));
test('malformed untrusted input fails closed',()=>assert.deepEqual(decide({protocol:'EO-WORKFLOW/0.1.0'}),unknown));
test('CLI speaks single-line protocol over stdin and stdout',()=>{
 const s=spawnSync(process.execPath,[fileURLToPath(new URL('./eo001-lab-candidate.mjs',import.meta.url))],{input:JSON.stringify(ctx([obs()])),encoding:'utf8'});
 assert.equal(s.status,0,s.stderr);assert.deepEqual(JSON.parse(s.stdout),{action:'finish',payment_status:'confirmed',fulfillment_authorized:true,receipt_id:'synthetic-effect-1'});
});
