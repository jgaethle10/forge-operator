/**
 * Evercraft Growth Signal | Client 001 | Local reference event service
 * Built-in Node dependencies only. No OAuth client credentials. No Square integration yet.
 * NEVER deploy publicly without TLS, durable DB, auth hardening, provider adapters and client approval.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';

const PORT=Number(process.env.SIGNAL_PORT || 8784);
const HOST=process.env.SIGNAL_HOST || '127.0.0.1';
const approved=process.env.SIGNAL_CLIENT_APPROVED==='true';
const ingestSecret=process.env.SIGNAL_INGEST_HMAC_SECRET||'';
const readToken=process.env.SIGNAL_READ_TOKEN||'';
const storage=path.resolve(process.env.SIGNAL_LEDGER_PATH||'./growth-signal-ledger.ndjson');
const DEMO_MODE=process.env.SIGNAL_DEMO_MODE==='true';
const allowed=new Set(['EC-EN-001','EC-ES-001','EC-FB-001','EC-FLEET-001','DIRECT','UNKNOWN']);
const publicActions=new Set(['campaign_view','call_button_click','email_button_click','booking_start']);
const privateActions=new Set(['payment_completed','payment_refunded','booking_confirmed','service_fulfilled']);
const sha=s=>createHash('sha256').update(s).digest('hex');
const sign=(secret,body)=>createHmac('sha256',secret).update(body).digest('hex');
const safeEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)};
const send=(res,status,obj)=>{const buf=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':buf.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(buf)};
const events=[];let last='GENESIS';const seen=new Set();
if(fs.existsSync(storage)){
 for(const line of fs.readFileSync(storage,'utf8').trim().split('\n').filter(Boolean)){
  const r=JSON.parse(line);const target=sha(`${last}\n${JSON.stringify(r.payload)}`);
  if(r.previous!==last||r.hash!==target)throw Error('ledger_integrity_failed');
  if(seen.has(r.payload.id))throw Error('ledger_duplicate_id');
  events.push(r.payload);seen.add(r.payload.id);last=r.hash;
 }
}
function append(e){if(seen.has(e.id))return false;fs.mkdirSync(path.dirname(storage),{recursive:true});const hash=sha(`${last}\n${JSON.stringify(e)}`);fs.appendFileSync(storage,JSON.stringify({previous:last,hash,payload:e})+'\n',{mode:0o600,encoding:'utf8'});events.push(e);seen.add(e.id);last=hash;return true;}
function validate(body,trusted=false){if(!body||typeof body!=='object'||Array.isArray(body))return 'invalid_body';
 if(Object.keys(body).length>12)return 'unexpected_fields';
 const permitted=['id','campaign','action','occurred_at','event_reference','amount_cents','currency','merchant_evidence_ref','source_evidence_ref','first_visit_confirmed','session_ref'];
 if(Object.keys(body).some(k=>!permitted.includes(k)))return 'unexpected_fields';
 if(typeof body.id!=='string'||!/^[A-Za-z0-9_-]{8,96}$/.test(body.id))return 'invalid_id';
 if(!allowed.has(body.campaign))return 'invalid_campaign';
 if(!((trusted?privateActions:publicActions).has(body.action)))return 'invalid_action_for_trust_level';
 if(typeof body.occurred_at!=='string'||isNaN(Date.parse(body.occurred_at)))return 'invalid_time';
 if(Date.parse(body.occurred_at)>Date.now()+5*60*1000)return 'future_event';
 for(const key of ['event_reference','merchant_evidence_ref','source_evidence_ref','session_ref'])if(body[key]!==undefined&&(!/^[a-zA-Z0-9._:-]{1,120}$/.test(String(body[key]))))return 'invalid_reference';
 if(trusted){if(!body.merchant_evidence_ref)return 'merchant_evidence_missing';if(body.action.startsWith('payment_')&&(!Number.isSafeInteger(body.amount_cents)||body.amount_cents<0||body.amount_cents>100000000))return 'invalid_payment_amount';if(body.action.startsWith('payment_')&&body.currency!=='USD')return 'unsupported_currency';}else if(['amount_cents','merchant_evidence_ref','first_visit_confirmed'].some(k=>k in body))return 'public_event_cannot_attest_payment';
 return null;
}
function summary(){const publicEvents=events.filter(e=>e.trust==='unverified_public_event');const trusted=events.filter(e=>e.trust==='signed_internal_adapter');
 let collected=0,refunded=0;const byProviderPayment=new Map();
 for(const e of trusted){if(e.action==='payment_completed'){if(!byProviderPayment.has(e.merchant_evidence_ref))byProviderPayment.set(e.merchant_evidence_ref,e);}
 else if(e.action==='payment_refunded')refunded+=e.amount_cents||0;}
 for(const e of byProviderPayment.values())collected+=e.amount_cents||0;
 // Campaign attribution remains provisional until an independently verified first-visit + source join exists.
 const campaign={};for(const c of allowed)campaign[c]={observations:0,payments:0,merchant_collected_cents:0};
 for(const e of publicEvents)campaign[e.campaign].observations++;
 for(const e of byProviderPayment.values()){campaign[e.campaign].payments++;campaign[e.campaign].merchant_collected_cents+=e.amount_cents;}
 return {schema:'evercraft.growth-signal.summary.v0.1',client:'client001',status:approved?'COLLECTOR_APPROVED':'CLIENT_APPROVAL_REQUIRED',event_count:events.length,public_event_count:publicEvents.length,merchant_payment_event_count:trusted.filter(e=>e.action==='payment_completed').length,merchant_collected_cents:Math.max(0,collected-refunded),attributed_first_visit_cents:null,attribution_state:'NOT_INDEPENDENTLY_RECONCILED',incremental_growth_cents:null,baseline_state:'MISSING',provider_connection_state:'NOT_IMPLEMENTED',by_campaign:campaign,last_chain_hash:last};}
const server=http.createServer(async (req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,product:'evercraft.growth-signal',mode:'local_reference',clientApproved:approved,integrationLive:false});
 if(req.method==='GET'&&req.url==='/v1/summary'){
  if(!readToken||!safeEqual(req.headers.authorization,'Bearer '+readToken))return send(res,401,{error:'unauthorized'});
  return send(res,200,summary());
 }
 if(req.method!=='POST'||!['/v1/observation','/v1/merchant'].includes(req.url))return send(res,404,{error:'not_found'});
 if(!approved)return send(res,403,{error:'client_approval_required'});
 if(!ingestSecret||ingestSecret.length<32||!readToken||readToken.length<32)return send(res,503,{error:'secrets_not_configured'});
 const trusted=req.url==='/v1/merchant';
 let chunks=[];let bytes=0;
 try{for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return send(res,413,{error:'too_large'});chunks.push(chunk)}}catch{return send(res,400,{error:'invalid_request'})}
 const raw=Buffer.concat(chunks).toString('utf8');const sig=req.headers['x-evercraft-signature'];
 if(!safeEqual(sig,sign(ingestSecret,raw)))return send(res,401,{error:'invalid_signature'});
 // Merchant events are internal connector events ONLY. The verified provider webhook must be independently
 // checked, and the provider payment re-fetched, before this privileged route is called.
 if(trusted && req.headers['x-evercraft-adapter']!=='square-verified-server-adapter')return send(res,403,{error:'provider_adapter_required'});
 let body;try{body=JSON.parse(raw)}catch{return send(res,400,{error:'malformed_json'})}
 const err=validate(body,trusted);if(err)return send(res,422,{error:err});
 const normalized={id:body.id,campaign:body.campaign,action:body.action,occurred_at:body.occurred_at,trust:trusted?'signed_internal_adapter':'unverified_public_event',source:'client001',...Object.fromEntries(Object.entries(body).filter(([k])=>!['id','campaign','action','occurred_at'].includes(k)))};
 const added=append(normalized);return send(res,added?201:200,{accepted:true,duplicate:!added,event_hash:last,trust:normalized.trust});
});
if(!DEMO_MODE&&!approved)console.warn('CLIENT APPROVAL REQUIRED: collector is disabled.');
server.listen(PORT,HOST,()=>console.log(JSON.stringify({listening:`http://${HOST}:${PORT}`,product:'growth_signal',client_approved:approved,demo_mode:DEMO_MODE,provider_connection:'none'})));