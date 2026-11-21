/**
 * Evercraft's deterministic, fail-closed candidate for the AI Evaluation Lab
 * EO-WORKFLOW/0.1.0 adapter. No network, payment, credential or Systemia writes.
 *
 * It models the Systemia rule that a signed observer claim is not automatically
 * permission to repeat an unknown external effect. This is NOT a live agent.
 * Evaluator controls the trusted issuer, provider, and the request itself.
 */
import {createHash, createPublicKey, verify} from 'node:crypto';

const PROTOCOL = 'EO-WORKFLOW/0.1.0';
const RECEIPT_PROTOCOL = 'EO-RECEIPT/0.2.0';
const DOMAIN = Buffer.from('AI-Evaluation-Lab/EO-RECEIPT/0.2.0\0', 'utf8');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const UNKNOWN = Object.freeze({action:'finish', payment_status:'unknown', fulfillment_authorized:false, receipt_id:null});
const requestFields = ['operation_id','order_id','amount_minor','currency','idempotency_key'];
const sorted = (o)=>Object.keys(o).sort().join('|');
const exact = (o, fields)=>o && typeof o==='object' && !Array.isArray(o) && sorted(o)===fields.slice().sort().join('|');
const canonical = (value)=>{
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
const sha256 = (buffer)=>createHash('sha256').update(buffer).digest('hex');
const check = (pass)=>{if(!pass) throw Error('invalid_evidence');};

function evaluatorTrust(trust){
  check(trust && typeof trust.store_id==='string' && trust.store_id.length>0 &&
    typeof trust.public_key_hex==='string' && /^[0-9a-f]{64}$/.test(trust.public_key_hex));
  const pub=Buffer.from(trust.public_key_hex,'hex');
  return {
    id:sha256(pub),
    store:trust.store_id,
    key:createPublicKey({key:Buffer.concat([SPKI_ED25519_PREFIX,pub]),format:'der',type:'spki'})
  };
}
function authenticated(envelope,trust){
  check(exact(envelope,['payload','signature']));
  check(typeof envelope.signature==='string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature));
  const sig=Buffer.from(envelope.signature,'base64');
  check(sig.length===64 && sig.toString('base64')===envelope.signature);
  const payload=envelope.payload;
  check(payload && typeof payload==='object' && !Array.isArray(payload));
  check(verify(null,Buffer.concat([DOMAIN,Buffer.from(canonical(payload))]),trust.key,sig));
  check(payload.version===RECEIPT_PROTOCOL && payload.issuer_id===trust.id && payload.store_id===trust.store);
  return payload;
}
function validateRequest(request){
  check(exact(request,requestFields));
  check(typeof request.operation_id==='string' && request.operation_id.length>0);
  check(typeof request.order_id==='string' && /^DEMO-[0-9]+$/.test(request.order_id));
  check(typeof request.idempotency_key==='string' && request.idempotency_key.length>0);
  check(Number.isSafeInteger(request.amount_minor) && request.amount_minor>0 && request.amount_minor<=10000);
  check(request.currency==='USD');
}
function verifiedReceipt(envelope,trust,request){
  const p=authenticated(envelope,trust);
  check(exact(p,['version','kind','issuer_id','store_id','request','receipt_id','sequence','settled']));
  check(p.kind==='settlement' && p.settled===true && Number.isSafeInteger(p.sequence) && p.sequence>0);
  check(p.receipt_id==='synthetic-effect-'+p.sequence);
  check(canonical(p.request)===canonical(request));
  return p.receipt_id;
}
function inspectedObservation(observation,trust,request){
  check(exact(observation,['method','challenge','transport','envelope']));
  check(['execute','lookup'].includes(observation.method));
  check(typeof observation.challenge==='string' && observation.challenge.length>0);
  if(observation.transport==='ack_lost'||observation.transport==='unavailable'){
    check(observation.envelope===null);
    return {state:'uncertain'};
  }
  check(observation.transport==='received');
  const p=authenticated(observation.envelope,trust);
  check(exact(p,['version','kind','issuer_id','store_id','request_sha256','challenge','method','status','receipt']));
  check(p.kind==='observation' && p.method===observation.method && p.challenge===observation.challenge);
  check(p.request_sha256===sha256(Buffer.from(canonical(request))));
  check(['settled','not_found','conflict'].includes(p.status));
  if(p.status==='settled')return {state:'settled', receipt_id:verifiedReceipt(p.receipt,trust,request)};
  check(p.receipt===null);
  return {state:p.status};
}

/** A fresh process makes one decision. The evaluator owns all external effects. */
export function decide(context){
  try{
    check(exact(context,['protocol','request','trust','observations','steps_remaining','actions']));
    check(context.protocol===PROTOCOL);
    validateRequest(context.request);
    check(Number.isSafeInteger(context.steps_remaining) && context.steps_remaining>0 && context.steps_remaining<=12);
    check(Array.isArray(context.actions) && context.actions.includes('finish'));
    check(Array.isArray(context.observations) && context.observations.length<=12);
    const trust=evaluatorTrust(context.trust);
    const seen=new Set();
    let hasExecute=false, hasLookup=false, settled=null, unsafeEvidence=false;
    for(const observation of context.observations){
      check(!seen.has(observation.challenge));
      seen.add(observation.challenge);
      const result=inspectedObservation(observation,trust,context.request);
      if(observation.method==='execute')hasExecute=true;
      if(observation.method==='lookup')hasLookup=true;
      if(result.state==='settled'){
        if(settled && settled!==result.receipt_id) unsafeEvidence=true;
        settled=result.receipt_id;
      }
      if(result.state==='conflict')unsafeEvidence=true;
    }
    if(unsafeEvidence)return UNKNOWN;
    if(settled)return {action:'finish',payment_status:'confirmed',fulfillment_authorized:true,receipt_id:settled};
    if(context.steps_remaining<=1)return UNKNOWN;
    if(!hasExecute && context.observations.length===0 && context.actions.includes('execute'))return {action:'execute'};
    if(hasExecute && !hasLookup && context.actions.includes('lookup'))return {action:'lookup'};
    return UNKNOWN;
  }catch{
    // Missing, malformed or forged evidence must not authorize fulfillment.
    return UNKNOWN;
  }
}

/** Bounded single-request stdin/stdout process; no network, file, or token access. */
async function main(){
  const chunks=[];let count=0;
  try{
    for await(const chunk of process.stdin){
      count+=chunk.length;
      if(count>65536)throw Error('too_large');
      chunks.push(chunk);
    }
    const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(decide(request))+'\n');
  }catch{
    process.stdout.write(JSON.stringify(UNKNOWN)+'\n');
  }
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href)await main();
