#!/usr/bin/env node
import { createHash } from 'node:crypto';

const clean=(value)=>String(value??'').trim();
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const origin=clean(
  arg('--origin',process.env.EVERCRAFT_OPERATOR_EDGE_ORIGIN||'https://fabric.systemiacommandcenters.com')
).replace(/\/+$/,'');
const parsed=new URL(origin);
if(parsed.protocol!=='https:') throw new Error('faie_launch_gate_requires_https');
if(/(^|\.)base44\.app$/i.test(parsed.hostname)) throw new Error('faie_launch_gate_must_use_owned_fabric');

async function timedFetch(target,options={},timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(
    ()=>controller.abort(new DOMException('request timed out','TimeoutError')),
    timeoutMs
  );
  try{
    return await fetch(target,{...options,signal:controller.signal,redirect:'follow'});
  }finally{
    clearTimeout(timer);
  }
}

async function getText(path){
  const response=await timedFetch(origin+path,{
    headers:{'user-agent':'Evercraft-FAIE-AgNormal-Launch-Gate/1.0'}
  });
  const text=await response.text();
  if(!response.ok) throw new Error('http_'+response.status+':'+path);
  return {response,text};
}

async function getJson(path){
  const response=await timedFetch(origin+path,{
    headers:{accept:'application/json','user-agent':'Evercraft-FAIE-AgNormal-Launch-Gate/1.0'}
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body) throw new Error('json_http_'+response.status+':'+path);
  return body;
}

async function postJson(path,payload){
  const response=await timedFetch(origin+path,{
    method:'POST',
    headers:{
      accept:'application/json',
      'content-type':'application/json',
      'user-agent':'Evercraft-FAIE-AgNormal-Launch-Gate/1.0'
    },
    body:JSON.stringify(payload)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body) throw new Error('json_post_http_'+response.status+':'+path);
  return body;
}

async function rpc(path,id,method,params={}){
  const response=await timedFetch(origin+path,{
    method:'POST',
    headers:{
      accept:'application/json',
      'content-type':'application/json',
      'user-agent':'Evercraft-FAIE-AgNormal-Launch-Gate/1.0'
    },
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body) throw new Error('mcp_http_'+response.status+':'+method);
  if(body.error) throw new Error('mcp_'+method+':'+clean(body.error.message));
  return body.result;
}

const receipt={
  schema:'evercraft.faie-agnormal-launch-gate.v1',
  origin,
  partner_url:origin+'/faie/agnormal/',
  health_url:origin+'/api/faie/health',
  investigation_url:origin+'/api/faie/investigate',
  mcp_url:origin+'/mcp/faie',
  observed_at:new Date().toISOString(),
  verified:false,
  stage:'start',
  checks:{}
};

try{
  receipt.stage='partner_surface';
  const page=await getText('/faie/agnormal/');
  const contentType=page.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(contentType)) throw new Error('faie_agnormal_surface_not_html');
  if(!/Prepared for AgNormal/i.test(page.text)) throw new Error('faie_agnormal_partner_identity_missing');
  if(!/One real decision\. Live evidence\. No theater\./i.test(page.text)){
    throw new Error('faie_agnormal_partner_promise_missing');
  }
  if(!/id="activityHud"/.test(page.text)) throw new Error('faie_agnormal_activity_hud_missing');
  if(!/Cancel operation/.test(page.text)) throw new Error('faie_agnormal_cancel_control_missing');
  if(!/Download handed off/.test(page.text)) throw new Error('faie_agnormal_truthful_download_receipt_missing');
  if(!/fetchWithTimeout/.test(page.text)) throw new Error('faie_agnormal_timeout_guard_missing');
  if(/base44\.app/i.test(page.text)) throw new Error('faie_agnormal_base44_reference');
  receipt.partner_surface={
    status:page.response.status,
    content_type:contentType,
    identity_verified:true,
    activity_hud_verified:true,
    cancel_control_verified:true,
    truthful_download_handoff_verified:true,
    timeout_guard_verified:true,
    base44_reference_absent:true
  };
  receipt.checks.partner_surface=true;

  receipt.stage='health';
  const health=await getJson('/api/faie/health');
  if(health.fabric_native!==true) throw new Error('faie_health_not_fabric_native');
  if(health.public_surface!=='/faie/') throw new Error('faie_health_public_path_mismatch');
  if(health.design_partner_surface!=='/faie/agnormal/') throw new Error('faie_health_design_partner_path_mismatch');
  if(health.public_mcp!=='/mcp/faie') throw new Error('faie_health_mcp_path_mismatch');
  if(health.base44_transport_enabled!==false) throw new Error('faie_health_base44_transport_enabled');
  if(health.public_preview_persists_queries!==false) throw new Error('faie_health_public_preview_persistence_boundary_failed');
  if(health.decision_authority!==false||health.publication_authority!==false){
    throw new Error('faie_health_authority_boundary_failed');
  }
  receipt.health={
    ok:health.ok===true,
    signal_count:Number(health.signal_count||0),
    observation_count:Number(health.observation_count||0),
    fabric_native:true,
    design_partner_surface:health.design_partner_surface,
    public_preview_persists_queries:false,
    decision_authority:false,
    publication_authority:false,
    base44_transport_enabled:false
  };
  receipt.checks.health=true;

  receipt.stage='investigation';
  const investigation=await postJson('/api/faie/investigate',{
    question:'What current evidence could materially weaken reliance on Yakima Valley water availability for regionally scaled food production?',
    region_keys:['yakima-wa'],
    asset_types:['regional food production infrastructure'],
    crop:'mixed high-value food crop production',
    water_source:'Yakima River Basin irrigation and groundwater',
    thesis_assumptions:[
      'Regional water availability can support the target production system.',
      'Water constraints must be resolved before consequential capital decisions rely on the thesis.'
    ],
    horizon_days:90
  });
  if(investigation.schema!=='evercraft.faie.investigation.v1'){
    throw new Error('faie_agnormal_investigation_schema_invalid');
  }
  if(!Array.isArray(investigation.findings)||!Array.isArray(investigation.unknowns)){
    throw new Error('faie_agnormal_investigation_evidence_shape_invalid');
  }
  if(!Array.isArray(investigation.evidence_acquisition_queue)){
    throw new Error('faie_agnormal_next_proof_queue_missing');
  }
  if(investigation.findings.length<1){
    throw new Error('faie_agnormal_water_evidence_missing');
  }
  const waterFindings=investigation.findings.filter((finding)=>
    Array.isArray(finding.dimensions)&&finding.dimensions.includes('water')
  );
  if(waterFindings.length<1){
    throw new Error('faie_agnormal_water_dimension_missing');
  }
  if(!waterFindings.some((finding)=>
    Array.isArray(finding.provenance_refs)&&
    finding.provenance_refs.some((ref)=>/^https?:\/\//i.test(String(ref||'')))
  )){
    throw new Error('faie_agnormal_water_provenance_missing');
  }
  if(investigation.decision_packet?.framework!=='SENSE_CHALLENGE_DECIDE'){
    throw new Error('faie_agnormal_decision_packet_framework_invalid');
  }
  if(
    investigation.decision_packet?.decide?.human_review_required!==true||
    investigation.decision_packet?.decide?.action_authority!==false||
    investigation.decision_authority!==false||
    investigation.publication_authority!==false
  ){
    throw new Error('faie_agnormal_authority_boundary_failed');
  }
  receipt.investigation={
    schema:investigation.schema,
    status:investigation.status,
    finding_count:investigation.findings.length,
    water_finding_count:waterFindings.length,
    water_source_families:[...new Set(waterFindings.map((finding)=>finding.source_family).filter(Boolean))],
    water_provenance_ref_count:waterFindings.reduce((sum,finding)=>sum+(finding.provenance_refs||[]).length,0),
    unknown_count:investigation.unknowns.length,
    next_proof_count:investigation.evidence_acquisition_queue.length,
    evidence_readiness:investigation.coverage?.decision_readiness||null,
    human_review_required:true,
    action_authority:false,
    decision_authority:false,
    publication_authority:false
  };
  receipt.checks.investigation=true;

  receipt.stage='mcp';
  const init=await rpc('/mcp/faie',101,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-faIE-agnormal-launch-gate',version:'1'}
  });
  if(init?.serverInfo?.name!=='evercraft-faie') throw new Error('faie_mcp_identity_mismatch');
  const toolList=await rpc('/mcp/faie',102,'tools/list',{});
  const tools=(toolList?.tools||[]).map((tool)=>clean(tool.name));
  for(const expected of [
    'investigate_faie_evidence',
    'compare_faie_candidates',
    'get_faie_signal_snapshot',
    'get_faie_health'
  ]){
    if(!tools.includes(expected)) throw new Error('faie_mcp_tool_missing:'+expected);
  }
  receipt.mcp={server:init.serverInfo.name,tools};
  receipt.checks.mcp=true;

  receipt.stage='complete';
  receipt.verified=true;
  receipt.state='ready_for_design_partner';
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}catch(error){
  receipt.verified=false;
  receipt.state='launch_gate_failed';
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.error_name=clean(error?.name||'')||null;
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stderr.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=1;
}
