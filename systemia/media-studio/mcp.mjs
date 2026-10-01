import crypto from 'node:crypto';

export const FALLEN_MCP=Object.freeze({
  slug:'fallen',
  path:'/mcp/fallen',
  server_name:'evercraft-fallen',
  title:'Fallen / Evercraft Studio',
  version:'0.1.0',
  truth_boundary:'Public machine access is limited to evidence-bound visual-explanation planning and plan audit. It does not upload private media, execute paid generation providers, fabricate source evidence, render final media, publish content, license assets, create checkout, or grant publication authority. Rendering and distribution remain separately authenticated and human-authorized.',
});

const SAFE_ANNOTATIONS=Object.freeze({
  readOnlyHint:true,
  destructiveHint:false,
  idempotentHint:true,
  openWorldHint:false,
});
const EVIDENCE_STATES=new Set(['observed','public_source','licensed','inferred','modeled','synthetic']);
const FRESHNESS_STATES=new Set(['fresh','not_applicable','stale','unknown','contradicted']);
const RIGHTS_STATES=new Set(['verified','not_required','unresolved','restricted']);
const ASPECTS=new Set(['16:9','9:16']);
const FORMATS=new Set(['documentary_explainer','educational_short','world_intelligence','product_explainer']);

function rpcResult(id,result){ return {jsonrpc:'2.0',id:id??null,result}; }
function rpcError(id,code,message){ return {jsonrpc:'2.0',id:id??null,error:{code,message}}; }
function toolResult(payload){
  return {
    content:[{type:'text',text:JSON.stringify(payload,null,2)}],
    structuredContent:payload,
    isError:false,
  };
}
function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}
function requiredText(value,name,max=4000){
  const out=clean(value,max);
  if(!out) throw new Error(name+'_required');
  return out;
}
function unique(values){
  return [...new Set((values||[]).map((x)=>clean(x,1000)).filter(Boolean))];
}
function hash(value){
  return 'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function boundedInt(value,name,{min,max,defaultValue}){
  const n=value===undefined?defaultValue:Number(value);
  if(!Number.isInteger(n)||n<min||n>max) throw new Error(name+'_out_of_range');
  return n;
}
function normalizedClaim(row,index){
  const claim=requiredText(row?.claim,'claims_'+index+'_claim',4000);
  const refs=unique(row?.source_refs);
  const evidenceState=clean(row?.evidence_state,80).toLowerCase();
  const freshness=clean(row?.freshness_state||'not_applicable',80).toLowerCase();
  if(!EVIDENCE_STATES.has(evidenceState)) throw new Error('claims_'+index+'_evidence_state_invalid');
  if(!FRESHNESS_STATES.has(freshness)) throw new Error('claims_'+index+'_freshness_state_invalid');
  return {
    claim_id:clean(row?.claim_id,120)||'claim-'+String(index+1).padStart(2,'0'),
    claim,
    source_refs:refs,
    evidence_state:evidenceState,
    volatile:row?.volatile===true,
    freshness_state:freshness,
  };
}
function normalizedAsset(row,index){
  const evidenceState=clean(row?.evidence_state,80).toLowerCase();
  const rightsState=clean(row?.rights_state,80).toLowerCase();
  if(!EVIDENCE_STATES.has(evidenceState)) throw new Error('visual_assets_'+index+'_evidence_state_invalid');
  if(!RIGHTS_STATES.has(rightsState)) throw new Error('visual_assets_'+index+'_rights_state_invalid');
  return {
    asset_id:clean(row?.asset_id,120)||'asset-'+String(index+1).padStart(2,'0'),
    label:requiredText(row?.label,'visual_assets_'+index+'_label',500),
    source_refs:unique(row?.source_refs),
    evidence_state:evidenceState,
    rights_state:rightsState,
  };
}
function sceneRole(index,total){
  if(index===0) return 'hook';
  if(index===total-1&&total>1) return 'synthesis';
  if(index===1) return 'context';
  return 'proof';
}
function matchingAssets(claim,assets){
  const refs=new Set(claim.source_refs);
  return assets.filter((asset)=>asset.source_refs.some((ref)=>refs.has(ref)));
}
function sceneDirection(role,claim,hasAsset){
  if(hasAsset){
    if(role==='hook') return 'Open on the strongest rights-cleared source-grounded visual, then reveal the claim with minimal text.';
    if(role==='context') return 'Establish place, system, or causal context using source-grounded media and restrained evidence labels.';
    if(role==='synthesis') return 'Resolve the explanation by reconnecting the strongest verified visuals and the key uncertainty, without overstating causality.';
    return 'Let source-grounded visuals carry the proof. Use maps, metrics, timelines, or documentary footage only when their source references are bound to this claim.';
  }
  return 'Do not substitute decorative stock or unlabeled generation. Acquire or create an explicitly labeled visualization with provenance before final production.';
}

export function fallenMachineTools(){
  return [
    {
      name:'get_fallen_capabilities',
      title:'Get Fallen machine capabilities',
      description:'Return the current bounded Fallen machine surface, evidence/rights requirements, and human handoff. Read-only and non-rendering.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:SAFE_ANNOTATIONS,
    },
    {
      name:'plan_visual_explanation',
      title:'Plan an evidence-bound visual explanation',
      description:'Turn a bounded research package into a documentary/educational visual production plan. Every scene remains tied to source references, evidence state, freshness, and visual-rights state. This tool does not render or publish.',
      inputSchema:{
        type:'object',
        required:['title','education_goal','claims'],
        properties:{
          title:{type:'string',minLength:1,maxLength:500},
          education_goal:{type:'string',minLength:1,maxLength:2000},
          format:{type:'string',enum:['documentary_explainer','educational_short','world_intelligence','product_explainer'],default:'documentary_explainer'},
          aspect_ratio:{type:'string',enum:['16:9','9:16'],default:'16:9'},
          duration_sec:{type:'integer',minimum:12,maximum:600,default:90},
          claims:{
            type:'array',minItems:1,maxItems:24,
            items:{
              type:'object',
              required:['claim','source_refs','evidence_state'],
              properties:{
                claim_id:{type:'string',minLength:1,maxLength:120},
                claim:{type:'string',minLength:1,maxLength:4000},
                source_refs:{type:'array',minItems:0,maxItems:32,items:{type:'string',minLength:1,maxLength:1000}},
                evidence_state:{type:'string',enum:['observed','public_source','licensed','inferred','modeled','synthetic']},
                volatile:{type:'boolean',default:false},
                freshness_state:{type:'string',enum:['fresh','not_applicable','stale','unknown','contradicted'],default:'not_applicable'}
              },
              additionalProperties:false
            }
          },
          visual_assets:{
            type:'array',maxItems:64,default:[],
            items:{
              type:'object',
              required:['label','source_refs','evidence_state','rights_state'],
              properties:{
                asset_id:{type:'string',minLength:1,maxLength:120},
                label:{type:'string',minLength:1,maxLength:500},
                source_refs:{type:'array',minItems:1,maxItems:32,items:{type:'string',minLength:1,maxLength:1000}},
                evidence_state:{type:'string',enum:['observed','public_source','licensed','inferred','modeled','synthetic']},
                rights_state:{type:'string',enum:['verified','not_required','unresolved','restricted']}
              },
              additionalProperties:false
            }
          }
        },
        additionalProperties:false
      },
      annotations:SAFE_ANNOTATIONS,
    },
    {
      name:'audit_visual_explanation_plan',
      title:'Audit a Fallen visual explanation plan',
      description:'Audit a plan returned by plan_visual_explanation for unresolved evidence, freshness, rights, rendering authority, or publication authority. Read-only.',
      inputSchema:{
        type:'object',
        required:['plan'],
        properties:{
          plan:{type:'object',description:'A plan previously returned by Fallen plan_visual_explanation.'}
        },
        additionalProperties:false
      },
      annotations:SAFE_ANNOTATIONS,
    },
  ];
}

export function planVisualExplanation(args={}){
  const title=requiredText(args.title,'title',500);
  const educationGoal=requiredText(args.education_goal,'education_goal',2000);
  const format=clean(args.format||'documentary_explainer',80);
  const aspect=clean(args.aspect_ratio||'16:9',20);
  if(!FORMATS.has(format)) throw new Error('format_invalid');
  if(!ASPECTS.has(aspect)) throw new Error('aspect_ratio_invalid');
  const durationSec=boundedInt(args.duration_sec,'duration_sec',{min:12,max:600,defaultValue:90});
  if(!Array.isArray(args.claims)||args.claims.length<1||args.claims.length>24) throw new Error('claims_length_invalid');
  if(args.visual_assets!==undefined&&!Array.isArray(args.visual_assets)) throw new Error('visual_assets_invalid');
  if((args.visual_assets||[]).length>64) throw new Error('visual_assets_length_invalid');

  const claims=args.claims.map(normalizedClaim);
  const assets=(args.visual_assets||[]).map(normalizedAsset);
  const blockers=[];
  const warnings=[];
  const evidenceRefs=unique(claims.flatMap((claim)=>claim.source_refs));

  for(const claim of claims){
    if(!claim.source_refs.length) blockers.push('claim_missing_source_refs:'+claim.claim_id);
    if(claim.volatile&&claim.freshness_state!=='fresh'){
      blockers.push('volatile_claim_not_fresh:'+claim.claim_id+':'+claim.freshness_state);
    }else if(!claim.volatile&&['stale','unknown','contradicted'].includes(claim.freshness_state)){
      warnings.push('nonvolatile_claim_freshness_'+claim.freshness_state+':'+claim.claim_id);
    }
  }
  for(const asset of assets){
    if(!asset.source_refs.length) blockers.push('visual_asset_missing_source_refs:'+asset.asset_id);
    if(asset.rights_state==='restricted') blockers.push('visual_asset_rights_restricted:'+asset.asset_id);
    if(asset.rights_state==='unresolved') blockers.push('visual_asset_rights_unresolved:'+asset.asset_id);
  }

  const secondsPerClaim=Math.max(4,Math.floor(durationSec/Math.max(1,claims.length)));
  const scenes=claims.map((claim,index)=>{
    const matched=matchingAssets(claim,assets);
    const usable=matched.filter((asset)=>['verified','not_required'].includes(asset.rights_state));
    const role=sceneRole(index,claims.length);
    if(!usable.length) warnings.push('visual_evidence_needed:'+claim.claim_id);
    return {
      scene_id:'scene-'+String(index+1).padStart(2,'0'),
      role,
      claim_id:claim.claim_id,
      narrative_purpose:claim.claim,
      target_duration_sec:index===claims.length-1
        ? Math.max(4,durationSec-secondsPerClaim*(claims.length-1))
        : secondsPerClaim,
      source_refs:claim.source_refs,
      evidence_state:claim.evidence_state,
      freshness_state:claim.freshness_state,
      visual_asset_ids:usable.map((asset)=>asset.asset_id),
      visual_state:usable.length?'source_grounded_visual_available':'visual_evidence_needed',
      direction:sceneDirection(role,claim,usable.length>0),
      modeled_or_synthetic_label_required:['modeled','synthetic','inferred'].includes(claim.evidence_state),
    };
  });

  const ready=blockers.length===0;
  const body={
    schema:'evercraft.fallen.visual-explanation-plan.v1',
    title,
    education_goal:educationGoal,
    format,
    aspect_ratio:aspect,
    duration_sec:durationSec,
    source_refs:evidenceRefs,
    claims,
    visual_assets:assets,
    scenes,
    blockers:unique(blockers),
    warnings:unique(warnings),
    admission_state:ready?'PLANNING_ACCEPTED_RENDER_AUTHORITY_REQUIRED':'BLOCKED_BEFORE_RENDER',
    evidence_state:'caller_supplied_research_package',
    rights_state:assets.length
      ? (assets.every((asset)=>['verified','not_required'].includes(asset.rights_state))?'resolved':'unresolved_or_restricted')
      : 'no_assets_supplied',
    provider_execution:false,
    rendering_authority:false,
    publication_authority:false,
    checkout_created:false,
    payment_created:false,
    external_action_taken:false,
    human_handoff:{
      required_for_rendering:true,
      required_for_publication:true,
      target:'authenticated_fallen_studio',
      reason:'Provider execution, asset-rights confirmation, final aesthetic review, rendering, and distribution are outside the public planning contract.'
    },
    next_safe_actions:unique([
      ...scenes.filter((scene)=>scene.visual_state==='visual_evidence_needed').map((scene)=>'resolve_visual_evidence:'+scene.claim_id),
      ...(blockers.some((x)=>x.includes('rights_'))?['resolve_visual_rights']:[]),
      ...(blockers.some((x)=>x.includes('not_fresh'))?['refresh_volatile_claim_evidence']:[]),
      ...(ready?['hand_off_to_authenticated_fallen_studio_for_render_admission']:[]),
    ]),
    truth_boundary:FALLEN_MCP.truth_boundary,
  };

  return {
    ...body,
    receipt_id:hash({
      schema:body.schema,
      title:body.title,
      education_goal:body.education_goal,
      format:body.format,
      aspect_ratio:body.aspect_ratio,
      duration_sec:body.duration_sec,
      claims:body.claims,
      visual_assets:body.visual_assets,
      scenes:body.scenes,
      blockers:body.blockers,
      warnings:body.warnings,
      admission_state:body.admission_state,
    }),
  };
}

export function auditVisualExplanationPlan(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)) throw new Error('plan_invalid');
  if(plan.schema!=='evercraft.fallen.visual-explanation-plan.v1') throw new Error('plan_schema_invalid');
  const blockers=unique(plan.blockers);
  const scenes=Array.isArray(plan.scenes)?plan.scenes:[];
  const findings=[];
  if(blockers.length) findings.push(...blockers.map((x)=>'existing_blocker:'+x));
  if(!scenes.length) findings.push('no_scenes');
  for(const scene of scenes){
    if(!Array.isArray(scene.source_refs)||!scene.source_refs.length) findings.push('scene_missing_source_refs:'+clean(scene.scene_id,120));
    if(scene.visual_state==='visual_evidence_needed') findings.push('scene_visual_evidence_needed:'+clean(scene.scene_id,120));
    if(['modeled','synthetic','inferred'].includes(scene.evidence_state)&&scene.modeled_or_synthetic_label_required!==true){
      findings.push('evidence_label_requirement_missing:'+clean(scene.scene_id,120));
    }
  }
  if(plan.rendering_authority!==false) findings.push('rendering_authority_must_be_false_on_public_plan');
  if(plan.publication_authority!==false) findings.push('publication_authority_must_be_false_on_public_plan');
  if(plan.provider_execution!==false) findings.push('provider_execution_must_be_false_on_public_plan');

  return {
    schema:'evercraft.fallen.visual-explanation-audit.v1',
    plan_receipt_id:clean(plan.receipt_id,200)||null,
    finding_count:unique(findings).length,
    findings:unique(findings),
    status:findings.length?'NEEDS_RESOLUTION_OR_HUMAN_REVIEW':'PUBLIC_PLAN_CONTRACT_PASS',
    rendering_authority:false,
    publication_authority:false,
    provider_execution:false,
    external_action_taken:false,
    truth_boundary:FALLEN_MCP.truth_boundary,
  };
}

export async function executeFallenRpc(rpc){
  const method=String(rpc?.method||'');
  const id=rpc?.id??null;
  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:FALLEN_MCP.server_name,version:FALLEN_MCP.version},
      instructions:FALLEN_MCP.truth_boundary,
    });
  }
  if(method==='tools/list') return rpcResult(id,{tools:fallenMachineTools()});
  if(method==='notifications/initialized') return null;

  if(method==='tools/call'){
    const tool=String(rpc?.params?.name||'');
    const args=rpc?.params?.arguments||{};
    try{
      if(tool==='get_fallen_capabilities'){
        return rpcResult(id,toolResult({
          ok:true,
          product:FALLEN_MCP.title,
          machine_surface:'read_only_evidence_bound_visual_planning',
          tools:fallenMachineTools().map((item)=>item.name),
          underlying_private_studio_capabilities:[
            'editable media project planning',
            'rights and provenance tracking',
            'continuity and canon gates',
            'world-intelligence visual stages',
            'creative council and shot tournament',
            'private distributed rendering'
          ],
          public_provider_execution:false,
          rendering_authority:false,
          publication_authority:false,
          payment_authority:false,
          external_action_taken:false,
          truth_boundary:FALLEN_MCP.truth_boundary,
        }));
      }
      if(tool==='plan_visual_explanation'){
        return rpcResult(id,toolResult({ok:true,product:FALLEN_MCP.title,...planVisualExplanation(args)}));
      }
      if(tool==='audit_visual_explanation_plan'){
        return rpcResult(id,toolResult({ok:true,product:FALLEN_MCP.title,...auditVisualExplanationPlan(args.plan)}));
      }
      return rpcError(id,-32602,'Unknown or unsupported Fallen tool.');
    }catch(error){
      return rpcError(id,-32602,error instanceof Error?error.message:'invalid_fallen_request');
    }
  }
  return rpcError(id,-32601,'Method not found.');
}
