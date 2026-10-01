function t(v,n=4000){return String(v??'').trim().slice(0,n)}
function ph(v){return String(v??'').replace(/[^0-9+]/g,'').slice(0,32)}
function slug(v,f='unknown'){const s=t(v,160).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return s||f}
function one(rows,label){if(!rows?.length)return null;if(rows.length>1)throw new Error(label+'_ambiguous');return rows[0]}
function ev(a=[],b=[],n=40){return [...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])].map(x=>t(x,260)).filter(Boolean).slice(0,n)}
function classify(type,body){
  if(['payment_question','contract_question','licensing_question'].includes(type))return{risk_class:'restricted',human_gate_required:true,human_gate_reason:type+' requires human review before any consequential action.'};
  if(body?.sensitive_action_requested)return{risk_class:'restricted',human_gate_required:true,human_gate_reason:'Sensitive action requested. Contact continuity is not sufficient identity verification.'};
  if(['complaint','reschedule_request'].includes(type))return{risk_class:'moderate',human_gate_required:false,human_gate_reason:''};
  return{risk_class:'low',human_gate_required:false,human_gate_reason:''};
}

export function materializeInternalOpsIntake({entityStore,appKey='evercraft-internalops',body,admission,now=new Date()}={}){
  if(!entityStore)throw new Error('internal_ops_entity_store_required');
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('internal_ops_intake_body_invalid');
  const mission=t(admission?.mission_key||body.systemia_mission_key,180);
  const dispatch=t(admission?.dispatch_order_id||body.systemia_dispatch_order_id,180);
  const authRef=t(admission?.authority_receipt_ref,500);
  const idem=t(body.idempotency_key,220);
  if(!mission||!dispatch||!authRef||!idem)throw new Error('systemia_admission_required');
  if(admission?.execution_authority_granted===true)throw new Error('internal_ops_intake_execution_authority_forbidden');

  const prior=entityStore.filter(appKey,'WorkRequest',{idempotency_key:idem},{sort:'-created_date',limit:2});
  if(prior.length){
    if(prior.length>1)throw new Error('internal_ops_work_request_idempotency_conflict');
    return{ok:true,duplicate:true,work_request_id:prior[0].id,status:prior[0].status,execution_authority_granted:false};
  }

  const type=t(body.request_type,80)||'other';
  const channel=t(body.source_channel,40)||'manual';
  const phone=ph(body.normalized_phone||body.phone);
  const email=t(body.email,320).toLowerCase();
  const customerKey=t(body.customer_key,220)||(phone?'phone:'+phone:email?'email:'+email:'anon:'+slug(idem));
  const at=new Date(now).toISOString();
  const evidence=Array.isArray(body.evidence_refs)?body.evidence_refs.map(x=>t(x,260)).filter(Boolean).slice(0,30):[];

  let customer=one(entityStore.filter(appKey,'Customer',{customer_key:customerKey},{sort:'-updated_date',limit:2}),'internal_ops_customer');
  const source=channel==='voice'?'voice':channel==='sms'?'sms':channel==='web'?'web':channel==='email'?'email':'other';
  const cp={last_seen_at:at,evidence_refs:ev(customer?.evidence_refs,evidence),source};
  if(t(body.full_name,180))cp.full_name=t(body.full_name,180);
  if(phone){cp.primary_phone=phone;cp.normalized_phone=phone}
  if(email)cp.email=email;
  customer=customer
    ?entityStore.update(appKey,'Customer',customer.id,cp,{now}).record
    :entityStore.create(appKey,'Customer',{
      customer_key:customerKey,full_name:t(body.full_name,180),primary_phone:phone,normalized_phone:phone,email,
      relationship_status:'lead',source,first_seen_at:at,last_seen_at:at,
      preferred_channel:['voice','sms','email','web'].includes(channel)?channel:'unknown',
      sensitive_identity_verified:false,evidence_refs:evidence
    },{now}).record;

  let property=null;
  const address=t(body.address,300);
  if(address||t(body.property_key,220)){
    const propertyKey=t(body.property_key,220)||'property:'+customerKey+':'+slug(address+'-'+(body.zip||''));
    property=one(entityStore.filter(appKey,'Property',{property_key:propertyKey},{sort:'-updated_date',limit:2}),'internal_ops_property');
    const pd={customer_key:customerKey,label:t(body.property_label,180)||address||'Service property',address_line1:address,address_line2:t(body.address_line2,180),city:t(body.city,120),state:t(body.state,40),zip:t(body.zip,20),last_seen_at:at,evidence_refs:ev(property?.evidence_refs,evidence)};
    property=property?entityStore.update(appKey,'Property',property.id,pd,{now}).record:entityStore.create(appKey,'Property',{property_key:propertyKey,first_seen_at:at,...pd},{now}).record;
  }

  const conversationKey=t(body.conversation_key,220)||channel+':'+slug(body.external_ref||idem);
  let conversation=one(entityStore.filter(appKey,'Conversation',{conversation_key:conversationKey},{sort:'-updated_date',limit:2}),'internal_ops_conversation');
  const cd={
    customer_key:customerKey,property_key:property?.property_key||t(body.property_key,220),
    channel:['voice','sms','web','email','manual'].includes(channel)?channel:'manual',external_ref:t(body.external_ref,220),
    last_message_at:at,status:body.human_escalation?'waiting_on_internal':'open',intent:t(body.intent,500),
    summary:t(body.summary||body.payload_summary,4000),human_escalation:Boolean(body.human_escalation),
    sensitive_action_blocked:Boolean(body.sensitive_action_requested||body.sensitive_action_blocked),
    systemia_dispatch_order_id:dispatch,evidence_refs:ev(conversation?.evidence_refs,[...evidence,'Systemia DispatchOrder '+dispatch])
  };
  conversation=conversation?entityStore.update(appKey,'Conversation',conversation.id,cd,{now}).record:entityStore.create(appKey,'Conversation',{conversation_key:conversationKey,started_at:t(body.started_at,80)||at,...cd},{now}).record;

  const risk=classify(type,body);
  let lead=null;
  if(!risk.human_gate_required&&['lead_intake','estimate_request','schedule_request','follow_up','support','job_status','complaint','reschedule_request','other'].includes(type)){
    const sourceLeadId='systemia:'+idem;
    lead=one(entityStore.filter(appKey,'LeadCapture',{source_lead_id:sourceLeadId},{sort:'-created_date',limit:2}),'internal_ops_lead');
    if(!lead&&['lead_intake','estimate_request','schedule_request'].includes(type)){
      lead=entityStore.create(appKey,'LeadCapture',{
        name:t(body.full_name,180),full_name:t(body.full_name,180),phone,email,address,city:t(body.city,120),state:t(body.state,40),zip:t(body.zip,20),
        service_type:t(body.service_type,180),service_details:t(body.summary||body.payload_summary,3000),
        notes:'Systemia-admitted '+type+'. Dispatch '+dispatch+'.',source:channel==='voice'?'Phone':channel==='web'?'Website':'Other',
        source_lead_id:sourceLeadId,submitted_at:at,captured_at:at,priority:t(body.priority,40)==='High'?'High':t(body.priority,40)==='Low'?'Low':'Normal',
        status:type==='schedule_request'?'Contact Needed':'New Lead'
      },{now}).record;
    }
  }

  const allowed=new Set(['lead_intake','estimate_request','schedule_request','reschedule_request','job_status','support','follow_up','complaint','payment_question','contract_question','licensing_question','other']);
  const requestKey=t(body.request_key,220)||'wr:'+slug(idem);
  const work=entityStore.create(appKey,'WorkRequest',{
    request_key:requestKey,idempotency_key:idem,customer_key:customerKey,property_key:property?.property_key||t(body.property_key,220),
    conversation_key:conversationKey,source_channel:['voice','sms','web','email','manual'].includes(channel)?channel:'manual',
    request_type:allowed.has(type)?type:'other',intent:t(body.intent,500),payload_summary:t(body.summary||body.payload_summary,4000),
    risk_class:risk.risk_class,human_gate_required:risk.human_gate_required,human_gate_reason:risk.human_gate_reason,
    status:risk.human_gate_required?'waiting_human':'queued',systemia_mission_key:mission,systemia_dispatch_order_id:dispatch,
    systemia_admission_receipt_ref:authRef,linked_lead_id:lead?.id||'',created_at:at,
    evidence_refs:ev([],[...evidence,'Systemia DispatchOrder '+dispatch,lead?.id?'LeadCapture '+lead.id:'']),
    notes:'Owned Systemia-first intake only. No contract, pricing exception, payment/refund, licensing/compliance or sensitive action executed.',
    execution_authority_granted:false
  },{now}).record;

  entityStore.create(appKey,'ActionLog',{
    action_type:'ai_action',target_type:'system',target_id:work.id,target_name:'EPS WorkRequest '+requestKey,
    user_id:'systemia-machine',user_email:'systemia@evercraft.internal',user_name:'Systemia',user_role:'system',
    new_value:JSON.stringify({request_type:type,risk_class:risk.risk_class,human_gate_required:risk.human_gate_required,linked_lead_id:lead?.id||null}),
    metadata:{mission_key:mission,dispatch_order_id:dispatch,authority_receipt_ref:authRef,idempotency_key:idem,conversation_key:conversationKey,customer_key:customerKey},
    actor_type:'ai',severity:risk.human_gate_required?'warning':'info',
    notes:'Systemia-first customer intent intake receipt. Intake only; no consequential action executed.'
  },{now});

  return{ok:true,duplicate:false,customer_id:customer.id,property_id:property?.id||null,conversation_id:conversation.id,work_request_id:work.id,lead_id:lead?.id||null,risk_class:risk.risk_class,human_gate_required:risk.human_gate_required,status:work.status,execution_authority_granted:false};
}
