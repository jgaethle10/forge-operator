#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pendingContextForConsumer } from '../worldstate/observation-fabric.mjs';

export const SPECTACLE_CONSUMER='social_spectacle';
const MODULE_FILE=fileURLToPath(import.meta.url);
const RECENT_WINDOW_MS=36*60*60*1000;
const MAX_QUEUE_PER_CYCLE=3;
const HARD_MAX_DAILY_PACKAGES=4;
const TARGET_DAILY_HERO_POSTS=2;
const BLOCKED_BRAND_KEYS=new Set(['rnb-chicken-and-soul','r-and-b-chicken-and-soul','r&b-chicken-and-soul']);
const HIGH_STAKES_AUTO_HOLD=new Set(['public_policy','politics','election','public_health']);

const clean=(value,max=4000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const clamp01=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback};
const unique=(values=[])=>[...new Set(values.map(v=>clean(v)).filter(Boolean))];
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function appendJsonl(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  fs.appendFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});
}

function arg(argv,name,fallback=''){
  const i=argv.indexOf(name);
  return i>=0&&argv[i+1]?argv[i+1]:fallback;
}

function readJson(file,fallback=null){
  if(!file||!fs.existsSync(file)) return fallback;
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}
}

function inputItems({inputFile,contextStateFile,radarStateFile}={}){
  if(inputFile){
    const payload=readJson(path.resolve(inputFile));
    if(!payload||!Array.isArray(payload.items)) throw new Error('spectacle input must contain items[]');
    return payload.items;
  }

  if(contextStateFile&&fs.existsSync(path.resolve(contextStateFile))){
    const state=readJson(path.resolve(contextStateFile));
    if(!state||state.schema!=='evercraft.context-fabric.state.v1'){
      throw new Error('spectacle context state schema invalid');
    }
    const rows=pendingContextForConsumer(state,SPECTACLE_CONSUMER).map(row=>({
      dispatch:{
        schema:row.schema,
        dispatch_key:row.dispatch_key,
        consumer:row.consumer,
        observation_id:row.observation_id,
        context_keys:row.context_keys,
        priority:row.priority,
        evidence_state:row.evidence_state,
        provenance_refs:row.provenance_refs,
        created_at:row.created_at,
      },
      observation:row.observation,
      brand_key:'evercraft',
    }));
    if(rows.length) return rows;
  }

  if(radarStateFile&&fs.existsSync(path.resolve(radarStateFile))){
    const radar=readJson(path.resolve(radarStateFile));
    if(!radar||radar.schema!=='evercraft.systemia-radar.state.v1'){
      throw new Error('spectacle radar state schema invalid');
    }
    return Object.values(radar.streams||{})
      .map(stream=>stream?.current)
      .filter(Boolean)
      .filter(signal=>signal?.review?.status==='pass')
      .filter(signal=>signal?.review?.freshness?.state==='fresh')
      .filter(signal=>signal?.publication_state==='eligible_for_editorial_selection')
      .map(signal=>({
        dispatch:{
          schema:'evercraft.context.dispatch.v1',
          dispatch_key:'radar-spectacle:'+clean(signal.signal_id,180),
          consumer:SPECTACLE_CONSUMER,
          observation_id:signal.observation_id,
          context_keys:signal.correlation_keys||[],
          priority:Number(signal.materiality_score||0)>=.8?'high':'normal',
          evidence_state:signal.observation?.evidence_state||'reported',
          provenance_refs:signal.provenance_refs||[],
          created_at:signal.last_verified_at||signal.observed_at,
        },
        observation:signal.observation,
        brand_key:'evercraft',
      }));
  }

  return [];
}

function visualPath(observation){
  const facts=observation?.facts||{};
  if(facts?.phenomenon?.kind==='flow') return {kind:'fallen_phenomenon',strength:1};
  if(Array.isArray(facts?.timeline)||Array.isArray(facts?.series)||Array.isArray(observation?.measurements)){
    const count=(facts.timeline?.length||0)+(facts.series?.length||0)+(observation.measurements?.length||0);
    if(count>=3) return {kind:'fallen_data_cinematic',strength:.82};
  }
  const mediaRefs=unique([...(observation?.media_refs||[]),...(facts?.media_refs||[])]);
  if(mediaRefs.length) return {kind:'verified_real_media',strength:.88,media_refs:mediaRefs};
  if((observation?.region_keys||[]).length&&Object.keys(facts).length>=3){
    return {kind:'fallen_geo_explainer',strength:.68};
  }
  return {kind:'none',strength:0};
}

function subjectKey(observation){
  return clean(
    observation?.correlation_keys?.[0]||
    [observation?.region_keys?.[0]||'global',observation?.domains?.[0]||'general',observation?.kind||'signal'].join('::'),
    220
  ).toLowerCase();
}

function sourceDiversity(observation){
  const refs=unique(observation?.provenance_refs||[]);
  const families=unique([observation?.source_family,...(observation?.source_families||[])]);
  return Math.min(1,.25*refs.length+.35*families.length);
}

function sensitivityHold(observation){
  const domains=(observation?.domains||[]).map(v=>clean(v).toLowerCase());
  const hit=domains.find(domain=>HIGH_STAKES_AUTO_HOLD.has(domain));
  return hit||null;
}

export function assessSpectacleDispatch({dispatch,observation,recentSubjects=[],brandKey='evercraft'}={}){
  if(!dispatch||dispatch.consumer!==SPECTACLE_CONSUMER){
    return {action:'ignore',reason:'not_social_spectacle_consumer',candidate:null};
  }
  if(!observation) return {action:'hold',reason:'observation_missing',candidate:null};

  const normalizedBrand=clean(brandKey,120).toLowerCase();
  if(BLOCKED_BRAND_KEYS.has(normalizedBrand)){
    return {action:'hold',reason:'brand_explicitly_blocked',candidate:null};
  }

  const provenance=unique(observation.provenance_refs||[]);
  if(!provenance.length) return {action:'hold',reason:'source_lineage_missing',candidate:null};

  const evidenceState=clean(observation.evidence_state).toLowerCase();
  if(!['reported','observed','verified','modeled'].includes(evidenceState)){
    return {action:'hold',reason:'unsupported_evidence_state',candidate:null};
  }

  const sensitiveDomain=sensitivityHold(observation);
  if(sensitiveDomain){
    return {
      action:'hold',
      reason:'high_stakes_requires_editorial_gate',
      held_domain:sensitiveDomain,
      candidate:null,
    };
  }

  const visual=visualPath(observation);
  if(visual.kind==='none'){
    return {action:'background',reason:'no_visual_story_path',candidate:null};
  }

  const subject=subjectKey(observation);
  const recent=new Set((recentSubjects||[]).map(v=>clean(v).toLowerCase()));
  const repeatPenalty=recent.has(subject)?.28:0;
  const anomaly=clamp01(observation.anomaly_score,.35);
  const reliability=clamp01(observation.reliability,.55);
  const diversity=sourceDiversity(observation);
  const geographic=(observation.region_keys||[]).length?.72:.35;
  const visuality=visual.strength;
  const motion=visual.kind==='fallen_phenomenon'?1:visual.kind==='fallen_data_cinematic'?.82:.58;
  const surprise=clamp01(observation.novelty_score,anomaly);

  const wonder=Math.max(0,Math.min(1,
    .22*visuality+
    .18*motion+
    .18*anomaly+
    .16*reliability+
    .10*diversity+
    .08*geographic+
    .08*surprise-
    repeatPenalty
  ));

  if(wonder<.70){
    return {
      action:'background',
      reason:repeatPenalty?'too_repetitive_for_hero_lane':'below_wonder_threshold',
      wonder_score:Number(wonder.toFixed(3)),
      subject_key:subject,
      candidate:null,
    };
  }

  const candidateId=`spectacle:${clean(observation.observation_id||sha(observation).slice(0,16),180)}`;
  const sourceLabel=evidenceState==='modeled'?'MODELED':evidenceState==='verified'?'VERIFIED':evidenceState==='observed'?'OBSERVED':'REPORTED';

  return {
    action:'candidate',
    reason:'hero_grade_visual_story',
    wonder_score:Number(wonder.toFixed(3)),
    subject_key:subject,
    candidate:{
      schema:'evercraft.social-spectacle.candidate.v1',
      candidate_id:candidateId,
      observation_id:observation.observation_id||null,
      observed_at:observation.observed_at||null,
      subject_key:subject,
      brand_key:normalizedBrand||'evercraft',
      title_seed:clean(observation.summary,280),
      domains:unique(observation.domains||[]),
      region_keys:unique(observation.region_keys||[]),
      evidence_state:evidenceState,
      evidence_label:sourceLabel,
      source_family:clean(observation.source_family,240),
      source_refs:provenance,
      wonder_score:Number(wonder.toFixed(3)),
      scoring:{
        visuality:Number(visuality.toFixed(3)),
        motion:Number(motion.toFixed(3)),
        anomaly:Number(anomaly.toFixed(3)),
        reliability:Number(reliability.toFixed(3)),
        source_diversity:Number(diversity.toFixed(3)),
        geographic:Number(geographic.toFixed(3)),
        surprise:Number(surprise.toFixed(3)),
        repeat_penalty:Number(repeatPenalty.toFixed(3)),
      },
      production:{
        visual_path:visual.kind,
        phenomenon:visual.kind==='fallen_phenomenon'?observation.facts?.phenomenon:null,
        data_payload:{
          facts:observation.facts||{},
          measurements:Array.isArray(observation.measurements)?observation.measurements.slice(0,100):[],
          observed_at:observation.observed_at,
          region_keys:observation.region_keys||[],
          kind:observation.kind,
        },
        media_refs:visual.media_refs||[],
        creative_rule:'one phenomenon, one unforgettable visual grammar, one clear explanation',
        no_text_card_first:true,
        real_visuals_before_generated:true,
        semantic_encoding_required:true,
        source_labels_visible:true,
        uncertainty_visible:true,
        preferred_runtime:'fallen',
        preferred_delivery:'evercraft_clip',
        derivatives:[
          {format:'vertical_hero',aspect_ratio:'9:16',target_duration_sec:[20,45],destinations:['instagram','facebook','youtube']},
          {format:'landscape_explainer',aspect_ratio:'16:9',target_duration_sec:[60,150],destinations:['youtube','linkedin']},
          {format:'loop_or_still',aspect_ratio:'4:5',target_duration_sec:[4,12],destinations:['instagram','facebook','linkedin']},
        ],
      },
      editorial:{
        hook_rule:'specific wonder, never clickbait',
        caption_style:'substantive_paragraphs',
        caption_minimum:'Explain what viewers are seeing, why it matters, what the evidence supports, and what remains uncertain.',
        journal_deep_dive_preferred:true,
        source_links_required:true,
        no_one_line_staccato:true,
      },
      distribution:{
        allowed_destinations:['facebook','instagram','linkedin','youtube'],
        held_unverified_destinations:['tiktok'],
        blocked_brand_keys:[...BLOCKED_BRAND_KEYS],
        standing_authorization_must_be_resolved_by_clip:true,
        provider_visible_verification_required:true,
      },
      gates:{
        fallen_master_qc:'required',
        editorial_preflight_10_of_10:'required',
        clip_intake_receipt:'required',
        clip_provider_receipt:'required',
        publication_authority:false,
      },
    }
  };
}

export function buildSpectacleQueue({assessments=[],recentSubjects=[],publishedToday=0,now=new Date()}={}){
  const recent=new Set((recentSubjects||[]).map(v=>clean(v).toLowerCase()));
  const candidates=assessments
    .filter(row=>row?.action==='candidate'&&row?.candidate)
    .map(row=>row.candidate)
    .sort((a,b)=>b.wonder_score-a.wonder_score);

  const dailyRemaining=Math.max(0,HARD_MAX_DAILY_PACKAGES-Math.max(0,Number(publishedToday)||0));
  const limit=Math.min(MAX_QUEUE_PER_CYCLE,dailyRemaining);
  const picked=[];
  const seenDomains=new Set();

  for(const candidate of candidates){
    if(picked.length>=limit) break;
    if(recent.has(candidate.subject_key)) continue;
    const primary=clean(candidate.domains?.[0]||'general').toLowerCase();
    if(seenDomains.has(primary)&&picked.length<2) continue;
    picked.push(candidate);
    recent.add(candidate.subject_key);
    seenDomains.add(primary);
  }

  return {
    schema:'evercraft.social-spectacle.queue.v1',
    generated_at:now.toISOString(),
    target_daily_hero_posts:TARGET_DAILY_HERO_POSTS,
    hard_max_daily_publishable_packages:HARD_MAX_DAILY_PACKAGES,
    quality_rule:'never fill the feed with filler; a no-op is better than a boring post',
    queue:picked,
    queue_count:picked.length,
    publication_authority:false,
  };
}

export function runSpectacleCycle({inputFile,contextStateFile,radarStateFile,stateDir,brandKey='evercraft',now=new Date()}={}){
  const items=inputItems({inputFile,contextStateFile,radarStateFile});

  const root=path.resolve(stateDir||'artifacts/social-spectacle');
  const stateFile=path.join(root,'state.json');
  const latestFile=path.join(root,'latest-queue.json');
  const ledgerFile=path.join(root,'receipts.jsonl');
  const state=readJson(stateFile,{recent_subjects:[],daily:{date:'',published_packages:0}});

  const nowMs=now.getTime();
  const recentRows=(state.recent_subjects||[]).filter(row=>{
    const at=Date.parse(row.at||'');
    return Number.isFinite(at)&&nowMs-at<RECENT_WINDOW_MS;
  });
  const today=now.toISOString().slice(0,10);
  const publishedToday=state.daily?.date===today?Number(state.daily?.published_packages||0):0;

  const assessments=items.map(item=>assessSpectacleDispatch({
    dispatch:item.dispatch,
    observation:item.observation,
    recentSubjects:recentRows.map(row=>row.subject_key),
    brandKey:item.brand_key||brandKey,
  }));
  const queue=buildSpectacleQueue({
    assessments,
    recentSubjects:recentRows.map(row=>row.subject_key),
    publishedToday,
    now,
  });

  const admitted=queue.queue.map(candidate=>({subject_key:candidate.subject_key,at:now.toISOString()}));
  const nextState={
    schema:'evercraft.social-spectacle.state.v1',
    updated_at:now.toISOString(),
    recent_subjects:[...recentRows,...admitted].slice(-120),
    daily:{date:today,published_packages:publishedToday},
    last_queue_digest:`sha256:${sha(queue)}`,
  };
  const receipt={
    schema:'evercraft.social-spectacle.cycle-receipt.v1',
    ran_at:now.toISOString(),
    input_count:items.length,
    candidate_count:assessments.filter(row=>row.action==='candidate').length,
    held_count:assessments.filter(row=>row.action==='hold').length,
    background_count:assessments.filter(row=>row.action==='background').length,
    queue_count:queue.queue_count,
    queue_digest:`sha256:${sha(queue)}`,
    publication_authority:false,
  };

  atomicJson(latestFile,queue);
  atomicJson(stateFile,nextState);
  appendJsonl(ledgerFile,receipt);

  return {queue,receipt,assessments};
}

async function cli(){
  const argv=process.argv.slice(2);
  const input=arg(argv,'--input',process.env.SYSTEMIA_SOCIAL_SPECTACLE_INPUT||'');
  const contextState=arg(argv,'--context-state',process.env.SYSTEMIA_SOCIAL_SPECTACLE_CONTEXT_STATE||'artifacts/worldstate/context-state.json');
  const radarStateDefault=process.env.RADAR_STATE_DIR?path.join(process.env.RADAR_STATE_DIR,'state.json'):'.runtime/radar/state.json';
  const radarState=arg(argv,'--radar-state',process.env.SYSTEMIA_SOCIAL_SPECTACLE_RADAR_STATE||radarStateDefault);
  const stateDir=arg(argv,'--state-dir',process.env.SYSTEMIA_SOCIAL_SPECTACLE_STATE_DIR||'artifacts/social-spectacle');
  const brandKey=arg(argv,'--brand',process.env.SYSTEMIA_SOCIAL_SPECTACLE_BRAND||'evercraft');
  const result=runSpectacleCycle({inputFile:input||undefined,contextStateFile:contextState||undefined,radarStateFile:radarState||undefined,stateDir,brandKey});
  console.log(JSON.stringify({ok:true,...result.receipt,queue:result.queue.queue},null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  cli().catch(error=>{
    console.error(JSON.stringify({ok:false,error:clean(error?.message||error,1200)}));
    process.exitCode=1;
  });
}
