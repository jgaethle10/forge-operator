import { randomUUID } from 'node:crypto';
import { createSharedSecretJsonWebhookVerifier } from '../webhook-gateway/provider-verifiers.mjs';

function clean(value,max=100000){ return String(value??'').trim().slice(0,max); }
function normalizePhone(value){ return clean(value,100).replace(/\D/g,'').slice(-10); }
function first(rows){ return Array.isArray(rows)&&rows.length?rows[0]:null; }

export class EvercraftRemoteOpsVoice {
  constructor({
    appKey='systemia-remote-ops',
    entityStore,
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('remote_ops_voice_entity_store_required');
    this.appKey=clean(appKey,127);
    this.entityStore=entityStore;
    this.clock=clock;
  }

  callerContext(body={}){
    const caller=clean(body.caller_id||body.from_number,100);
    const called=clean(body.called_number||body.to_number,100);
    const callSid=clean(body.call_sid||body.conversation_id||randomUUID(),255);
    const caller10=normalizePhone(caller);

    const nodes=this.entityStore.filter(this.appKey,'CompanyNode',{status:'active'},{limit:500});
    const voiceConfigs=this.entityStore.filter(this.appKey,'VoiceAgentConfig',{agent_name:'Raven'},{limit:20});
    const leads=caller10?this.entityStore.list(this.appKey,'LeadCapture',{sort:'-updated_date',limit:200}):[];
    const jobs=caller10?this.entityStore.list(this.appKey,'Job',{sort:'-updated_date',limit:200}):[];

    const lead=leads.find((row)=>normalizePhone(row.phone)===caller10)||null;
    const job=jobs.find((row)=>normalizePhone(row.client_phone)===caller10)||null;
    const config=first(voiceConfigs);
    const called10=normalizePhone(called);
    const companyNode=
      nodes.find((row)=>normalizePhone(row.phone_number)&&normalizePhone(row.phone_number)===called10)||
      nodes.find((row)=>row.node_id==='evercraft')||
      null;
    const callerName=clean(lead?.full_name||lead?.name||job?.client_name,500);
    const now=this.clock().toISOString();

    const existing=this.entityStore.filter(this.appKey,'VoiceCall',{provider_call_id:callSid},{limit:2});
    if(existing.length>1) throw new Error('voice_provider_call_id_ambiguous');
    let call=first(existing);
    const evidenceRefs=[
      lead?.id?`LeadCapture ${lead.id}`:'',
      job?.id?`Job ${job.id}`:''
    ].filter(Boolean);
    const callData={
      call_id:call?.call_id||`VOICE-${this.clock().getTime()}-${randomUUID().slice(0,8)}`,
      provider_call_id:callSid,
      provider:'ElevenLabs',
      direction:'inbound',
      from_number:caller,
      to_number:called,
      company_node_id:companyNode?.node_id||'evercraft',
      company_name:companyNode?.name||'Evercraft',
      primary_agent:'Raven',
      caller_name:callerName,
      caller_identity_confidence:callerName?85:0,
      related_lead_ref:lead?.id||'',
      related_customer_ref:job?.id||'',
      status:'ringing',
      started_at:call?.started_at||now,
      economic_stage:lead?'lead':'none',
      evidence_refs:evidenceRefs
    };
    call=call
      ?this.entityStore.update(this.appKey,'VoiceCall',call.id,callData).record
      :this.entityStore.create(this.appKey,'VoiceCall',callData).record;

    this.entityStore.create(this.appKey,'VoiceMoment',{
      call_id:callData.call_id,
      moment_id:`M-${this.clock().getTime()}-context`,
      sequence:0,
      occurred_at:now,
      speaker:'system',
      agent_name:'Raven',
      moment_type:'context_loaded',
      content:callerName
        ?`Verified local caller context loaded for ${callerName}.`
        :'No verified local caller identity found before answer.',
      evidence_refs:evidenceRefs,
      confidence:callerName?85:0,
      public_safe:false
    });

    return {
      ok:true,
      call,
      conversation_initiation_client_data:{
        dynamic_variables:{
          evercraft_call_id:callData.call_id,
          caller_name:callerName,
          caller_known:Boolean(callerName),
          company_name:companyNode?.name||'Evercraft',
          company_node_id:companyNode?.node_id||'evercraft',
          related_lead_ref:lead?.id||'',
          related_job_ref:job?.id||'',
          verified_context_summary:[
            callerName?`Caller name: ${callerName}`:'Caller identity unknown',
            lead?.service_type?`Known service interest: ${lead.service_type}`:'',
            lead?.status?`Lead status: ${lead.status}`:'',
            job?.job_name?`Known job: ${job.job_name}`:'',
            job?.status?`Job status: ${job.status}`:''
          ].filter(Boolean).join(' | '),
          raven_identity_prompt:config?.identity_prompt||'',
          raven_memory_policy:config?.memory_policy||''
        }
      }
    };
  }

  conversationEvent(body={}){
    const callId=clean(body.evercraft_call_id||body.call_id,255);
    if(!callId) throw new Error('call_id_required');
    const calls=this.entityStore.filter(this.appKey,'VoiceCall',{call_id:callId},{limit:2});
    if(calls.length!==1) throw new Error(calls.length?'voice_call_ambiguous':'voice_call_not_found');
    const call=calls[0];

    const now=this.clock().toISOString();
    const eventType=clean(body.event_type||body.type||'note',120);
    const allowedMoment=new Set([
      'utterance','context_loaded','memory_recalled','tool_called','tool_result',
      'specialist_consulted','decision','commitment','handoff','follow_up','risk','note'
    ]);
    const momentType=allowedMoment.has(eventType)?eventType:'note';
    const content=clean(body.content||body.message||body.summary||eventType,6000);
    const moments=this.entityStore.filter(this.appKey,'VoiceMoment',{call_id:callId},{limit:5000});
    const sequence=moments.reduce((max,row)=>Math.max(max,Number(row.sequence||0)),0)+1;
    const evidenceRefs=Array.isArray(body.evidence_refs)
      ?body.evidence_refs.map((value)=>clean(value,500)).filter(Boolean).slice(0,20)
      :[];

    const moment=this.entityStore.create(this.appKey,'VoiceMoment',{
      call_id:callId,
      moment_id:clean(body.moment_id,255)||`M-${this.clock().getTime()}-${randomUUID().slice(0,6)}`,
      sequence,
      occurred_at:clean(body.occurred_at,100)||now,
      speaker:['caller','Raven','specialist','system','human'].includes(clean(body.speaker,40))
        ?clean(body.speaker,40)
        :'system',
      agent_name:clean(body.agent_name||(body.speaker==='Raven'?'Raven':''),200),
      moment_type:momentType,
      content,
      tool_name:clean(body.tool_name,500),
      tool_input_summary:clean(body.tool_input_summary,2000),
      tool_result_summary:clean(body.tool_result_summary,2000),
      evidence_refs:evidenceRefs,
      confidence:Math.max(0,Math.min(100,Number(body.confidence||0))),
      public_safe:Boolean(body.public_safe)
    }).record;

    const patch={};
    if(eventType==='call_started'||eventType==='answered'){
      patch.status='live';
      patch.answered_at=call.answered_at||now;
    }
    if(eventType==='specialist_consulted'&&body.agent_name){
      patch.specialists_consulted=[...new Set([...(call.specialists_consulted||[]),clean(body.agent_name,200)])];
    }
    if((eventType==='tool_called'||eventType==='tool_result')&&body.tool_name){
      patch.tools_used=[...new Set([...(call.tools_used||[]),clean(body.tool_name,500)])];
    }
    if(eventType==='commitment'){
      patch.commitments=[...(call.commitments||[]),content].slice(-50);
    }
    if(eventType==='follow_up'){
      patch.follow_up_owner=clean(body.follow_up_owner||call.follow_up_owner||'Raven',500);
      patch.follow_up_action=clean(body.follow_up_action||content,4000);
      if(body.follow_up_due_at) patch.follow_up_due_at=clean(body.follow_up_due_at,100);
    }
    if(body.intent) patch.intent=clean(body.intent,1000);
    if(body.economic_stage) patch.economic_stage=clean(body.economic_stage,120);
    if(body.human_gate!==undefined) patch.human_gate=Boolean(body.human_gate);
    if(body.human_gate_reason) patch.human_gate_reason=clean(body.human_gate_reason,2000);
    if(body.sentiment) patch.sentiment=clean(body.sentiment,120);
    if(body.transcript) patch.transcript=clean(body.transcript,100000);
    if(body.summary) patch.summary=clean(body.summary,12000);
    if(eventType==='call_ended'||eventType==='completed'){
      patch.status='completed';
      patch.ended_at=clean(body.ended_at,100)||now;
      if(body.duration_seconds!==undefined) patch.duration_seconds=Math.max(0,Number(body.duration_seconds||0));
      if(body.recording_url) patch.recording_url=clean(body.recording_url,4000);
    }

    const updated=Object.keys(patch).length
      ?this.entityStore.update(this.appKey,'VoiceCall',call.id,patch).record
      :call;
    return {ok:true,call_id:callId,moment_id:moment.id,sequence,call_patch:patch,call:updated};
  }

  registerWebhooks(webhookGateway,{
    secretNamespace='webhook:systemia-remote-ops:voice',
    secretName='signing-secret',
    contextRouteKey='voice-context',
    eventRouteKey='voice-event'
  }={}){
    if(!webhookGateway||typeof webhookGateway.registerRoute!=='function'){
      throw new Error('remote_ops_voice_webhook_gateway_required');
    }
    webhookGateway.registerRoute({
      appKey:this.appKey,
      routeKey:contextRouteKey,
      secretNamespace,
      secretName,
      verifier:createSharedSecretJsonWebhookVerifier({
        header:'x-evercraft-voice-secret',
        eventIdFields:['call_sid','conversation_id']
      }),
      handler:async({body})=>this.callerContext(JSON.parse(body.toString('utf8')))
    });
    webhookGateway.registerRoute({
      appKey:this.appKey,
      routeKey:eventRouteKey,
      secretNamespace,
      secretName,
      verifier:createSharedSecretJsonWebhookVerifier({
        header:'x-evercraft-voice-secret',
        eventIdFields:['event_id','moment_id']
      }),
      handler:async({body})=>this.conversationEvent(JSON.parse(body.toString('utf8')))
    });
    return this;
  }

  health(){
    return {
      schema:'evercraft.remote-ops.voice-health.v1',
      state:'healthy',
      provider:'ElevenLabs',
      owned_call_ledger:true,
      owned_moment_ledger:true,
      shared_secret_ingress_supported:true,
      webhook_idempotency_externalized:true,
      base44_runtime_dependency:false
    };
  }
}
