import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { startFabricLocalRuntime } from '../mcp/fabric-local-runtime.mjs';

const token='fixture-raven-bridge-auth-secret-for-isolated-ci';
const route='/api/communications/raven-inbound';
const now=()=>new Date();
function signedPayload({channel='sms',text='I would like a fence estimate',id='synthetic-event-a',eventType,providerStatus}={}){
  const timestamp=new Date().toISOString();
  const payload={
    source_system:'raven_nexus',source_entity:channel==='sms'?'PhoneMessage':'VoiceCall',
    source_record_ref:'synthetic-source-'+id,idempotency_key:'synthetic-idempotency-'+id,
    provider_type:'twilio',provider_event_ref:'synthetic-provider-'+id,
    channel,direction:'inbound',occurred_at:timestamp,
    from_address:'redacted-fixture-sender',to_address:'redacted-fixture-receiver',
    event_type:eventType|| (channel==='voice'?'call_started':'message_received'),
    ...(channel==='sms'?{content_summary:text,content_permitted:false}:{content_summary:text,provider_status:providerStatus||'in_progress'}),
  };
  const body=JSON.stringify(payload);
  const signature=createHmac('sha256',token).update(timestamp+'.'+body).digest('hex');
  return {timestamp,body,signature};
}
async function send(origin, input, headers={}){
  const response=await fetch(origin+route,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-evercraft-timestamp':input.timestamp,
      'x-evercraft-signature':input.signature,
      ...headers,
    },
    body:input.body,
  });
  return {status:response.status,body:await response.json()};
}
async function withRuntime(options,fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'raven-phone-e2e-'));
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    ravenPhoneIngressSecret:token,
    ravenPhoneIngressDir:dir,
    ...options,
  });
  try{return await fn(runtime,dir)}
  finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true})}
}

test('actual Fabric HTTP rejects phone events when phone ingress is not configured',async()=>{
  await withRuntime({ravenPhoneIngressSecret:'',ravenPhoneIngressDir:''},async(runtime)=>{
    // Blank explicit args fall back to environment; CI excludes phone ingress env vars.
    const h=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(h.raven_phone_private_ingress_ready,false);
    assert.equal(h.raven_phone_outbound_authority,false);
    const result=await send(runtime.url,signedPayload());
    assert.equal(result.status,503);
    assert.equal(result.body.error,'private_ingress_disabled');
    const mcp=await fetch(runtime.mcpUrl,{headers:{accept:'text/event-stream'}});
    assert.equal(mcp.status,200);
  });
});

test('real HTTP path accepts signed Raven SMS once, then deduplicates retry',async()=>{
  await withRuntime({},async(runtime,dir)=>{
    const h=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(h.raven_phone_private_ingress_ready,true);
    assert.equal(h.raven_phone_private_ingress_path,route);
    assert.equal(h.raven_phone_outbound_authority,false);
    const signed=signedPayload();
    const first=await send(runtime.url,signed);
    assert.equal(first.status,202);
    assert.equal(first.body.status,'written');
    assert.equal(first.body.systemia_mission_admitted,false);
    assert.equal(first.body.provider_verified,false);
    assert.equal(first.body.payment_verified,false);
    const second=await send(runtime.url,signed);
    assert.equal(second.status,200);
    assert.equal(second.body.status,'duplicate');
    assert.equal(second.body.bridge_receipt_key,first.body.bridge_receipt_key);
    const records=fs.readdirSync(dir);
    assert.equal(records.length,1);
    const file=fs.readFileSync(path.join(dir,records[0]),'utf8');
    assert.equal(file.includes('fence estimate'),false);
    assert.equal(file.includes('synthetic-provider-event'),false);
    const candidate=JSON.parse(file);
    assert.equal(candidate.lane_candidate,'eps');
    assert.equal(candidate.outbound_authorized,false);
    assert.equal(candidate.payment_verified,false);
    assert.equal((fs.statSync(path.join(dir,records[0])).mode&0o077),0);
  });
});

test('signed STOP, partner routing, and call-start preserve strict human/compliance gates',async()=>{
  await withRuntime({},async(runtime,dir)=>{
    const stop=await send(runtime.url,signedPayload({id:'optout',text:'STOP'}));
    assert.equal(stop.status,202);
    const rivet=await send(runtime.url,signedPayload({id:'partner',text:'I want RIVET pricing'}));
    assert.equal(rivet.status,202);
    const call=await send(runtime.url,signedPayload({id:'call',channel:'voice',text:''}));
    assert.equal(call.status,202);
    const rows=fs.readdirSync(dir).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
    assert.equal(rows.find(x=>x.intent_class==='opt_out')?.next_gate,'compliance_suppression_review');
    assert.equal(rows.find(x=>x.lane_candidate==='rivet_partner_hold')?.next_gate,'partner_governance_review');
    assert.equal(rows.find(x=>x.channel==='voice')?.next_gate,'await_call_intent');
    assert.equal(rows.every(x=>x.callback_authorized===false),true);
  });
});

test('tamper, stale timestamp, and unsupported GET fail closed over actual HTTP',async()=>{
  await withRuntime({},async(runtime,dir)=>{
    const packet=signedPayload();
    const bad=await send(runtime.url,{...packet,body:packet.body+' '});
    assert.equal(bad.status,401);
    const expired=await send(runtime.url,{...packet,timestamp:'2026-01-01T00:00:00Z'});
    assert.equal(expired.status,401);
    const get=await fetch(runtime.url+route);
    assert.equal(get.status,405);
    assert.equal(fs.readdirSync(dir).length,0);
  });
});
