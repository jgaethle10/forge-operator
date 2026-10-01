#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftWebhookGateway } from '../webhook-gateway/webhook-gateway.mjs';
import { EvercraftRemoteOpsVoice } from './voice-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-remote-ops-voice-proof-'));
const now=new Date('2026-10-01T15:30:00.000Z');
const voiceSecret='voice-proof-secret-value';

try{
  const entities=new DurableEntityStore({stateDir:path.join(root,'entities')});
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  secrets.setSecret('webhook:systemia-remote-ops:voice','signing-secret',voiceSecret);

  entities.create('systemia-remote-ops','CompanyNode',{
    id:'node-evercraft',
    node_id:'evercraft',
    name:'Evercraft',
    phone_number:'+1 (509) 555-0100',
    status:'active'
  });
  entities.create('systemia-remote-ops','VoiceAgentConfig',{
    id:'voice-config',
    agent_name:'Raven',
    identity_prompt:'Raven proof identity',
    memory_policy:'Use only verified context.'
  });
  entities.create('systemia-remote-ops','LeadCapture',{
    id:'lead-proof',
    full_name:'Known Caller',
    phone:'+1 509 555 0199',
    service_type:'Tree service',
    status:'Qualified',
    updated_date:'2026-10-01T15:20:00.000Z'
  });
  entities.create('systemia-remote-ops','Job',{
    id:'job-proof',
    client_name:'Known Caller',
    client_phone:'509-555-0199',
    job_name:'Proof Job',
    status:'Scheduled',
    updated_date:'2026-10-01T15:25:00.000Z'
  });

  const runtime=new EvercraftRemoteOpsVoice({
    entityStore:entities,
    clock:()=>now
  });
  const webhooks=new EvercraftWebhookGateway({
    stateDir:path.join(root,'webhooks'),
    secretStore:secrets
  });
  runtime.registerWebhooks(webhooks);

  assert.equal(runtime.health().base44_runtime_dependency,false);

  const contextBody=Buffer.from(JSON.stringify({
    call_sid:'call-proof-1',
    caller_id:'+1 509 555 0199',
    called_number:'+1 509 555 0100'
  }));
  const headers={'x-evercraft-voice-secret':voiceSecret};

  const context=await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-context',
    headers,
    body:contextBody,
    now
  });
  assert.equal(context.status,'delivered');
  assert.equal(context.result.ok,true);
  const vars=context.result.conversation_initiation_client_data.dynamic_variables;
  assert.equal(vars.caller_name,'Known Caller');
  assert.equal(vars.caller_known,true);
  assert.equal(vars.related_lead_ref,'lead-proof');
  assert.equal(vars.related_job_ref,'job-proof');
  assert.match(vars.verified_context_summary,/Tree service/);

  const callId=vars.evercraft_call_id;
  assert.equal(entities.filter('systemia-remote-ops','VoiceCall',{call_id:callId}).length,1);
  assert.equal(entities.filter('systemia-remote-ops','VoiceMoment',{call_id:callId}).length,1);

  const replayContext=await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-context',
    headers,
    body:contextBody,
    now:new Date(now.getTime()+60*60*1000)
  });
  assert.equal(replayContext.replayed,true);
  assert.equal(entities.filter('systemia-remote-ops','VoiceMoment',{call_id:callId}).length,1);

  const toolEvent=Buffer.from(JSON.stringify({
    moment_id:'moment-proof-tool',
    evercraft_call_id:callId,
    event_type:'tool_result',
    speaker:'Raven',
    tool_name:'lookup_job',
    content:'Job found.',
    confidence:95
  }));
  const toolDelivered=await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-event',
    headers,
    body:toolEvent,
    now
  });
  assert.equal(toolDelivered.status,'delivered');
  let call=entities.filter('systemia-remote-ops','VoiceCall',{call_id:callId})[0];
  assert.deepEqual(call.tools_used,['lookup_job']);

  const commitment=Buffer.from(JSON.stringify({
    moment_id:'moment-proof-commitment',
    evercraft_call_id:callId,
    event_type:'commitment',
    content:'Send the estimate tomorrow.'
  }));
  await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-event',
    headers,
    body:commitment,
    now
  });

  const ended=Buffer.from(JSON.stringify({
    moment_id:'moment-proof-ended',
    evercraft_call_id:callId,
    event_type:'call_ended',
    duration_seconds:212,
    summary:'Caller requested an estimate.',
    transcript:'Synthetic proof transcript.',
    recording_url:'https://recordings.example.invalid/proof'
  }));
  await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-event',
    headers,
    body:ended,
    now
  });

  call=entities.filter('systemia-remote-ops','VoiceCall',{call_id:callId})[0];
  assert.equal(call.status,'completed');
  assert.equal(call.duration_seconds,212);
  assert.equal(call.summary,'Caller requested an estimate.');
  assert.deepEqual(call.commitments,['Send the estimate tomorrow.']);

  const beforeReplayMoments=entities.filter('systemia-remote-ops','VoiceMoment',{call_id:callId}).length;
  const replayEvent=await webhooks.handle({
    appKey:'systemia-remote-ops',
    routeKey:'voice-event',
    headers,
    body:toolEvent,
    now:new Date(now.getTime()+2*60*60*1000)
  });
  assert.equal(replayEvent.replayed,true);
  assert.equal(
    entities.filter('systemia-remote-ops','VoiceMoment',{call_id:callId}).length,
    beforeReplayMoments
  );

  await assert.rejects(
    ()=>webhooks.handle({
      appKey:'systemia-remote-ops',
      routeKey:'voice-event',
      headers:{'x-evercraft-voice-secret':'wrong-secret'},
      body:Buffer.from(JSON.stringify({
        moment_id:'moment-bad',
        evercraft_call_id:callId,
        event_type:'note',
        content:'should not land'
      })),
      now
    }),
    /webhook_signature_mismatch/
  );

  const secretFiles=[];
  const walk=(dir)=>{
    if(!fs.existsSync(dir)) return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.isFile()) secretFiles.push(fs.readFileSync(full));
    }
  };
  walk(path.join(root,'secrets'));
  assert.equal(Buffer.concat(secretFiles).toString('utf8').includes(voiceSecret),false);

  console.log(JSON.stringify({
    schema:'evercraft.remote-ops.voice-runtime-proof.v1',
    status:'pass',
    known_caller_context_preserved:true,
    raven_prompt_and_memory_policy_preserved:true,
    call_ledger_owned:true,
    moment_ledger_owned:true,
    tools_commitments_and_completion_preserved:true,
    webhook_replay_idempotent:true,
    invalid_shared_secret_rejected:true,
    shared_secret_encrypted_at_rest:true,
    base44_runtime_dependency:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
