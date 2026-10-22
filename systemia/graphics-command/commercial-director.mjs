import crypto from 'node:crypto';

const clean=(value)=>String(value??'').replace(/\s+/g,' ').trim();
const uniq=(values=[])=>[...new Set(values.map(clean).filter(Boolean))];

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

const COUNCIL_ROLES=[
  'story_architect',
  'cinematography_director',
  'visual_evidence_scout',
  'data_graphics_director',
  'world_builder',
  'edit_rhythm_director',
  'sound_director',
  'brand_art_director',
  'documentary_truth_guard',
  'beauty_judge',
];

export function normalizeCommercialCampaign(input){
  if(input?.schema!=='evercraft.commercial-attention-campaign.v1'){
    throw new Error('commercial_campaign_schema_invalid');
  }
  const id=clean(input.id);
  const slug=clean(input.slug).toLowerCase();
  const product=clean(input.product);
  const offer=clean(input.offer);
  const offerUrl=clean(input.offerUrl);
  const audience=clean(input.audience);
  const sourceRefs=uniq(input.sourceRefs||[]);
  const priceUsd=Number(input.priceUsd);
  if(!id) throw new Error('commercial_campaign_id_missing');
  if(!/^[a-z0-9-]+$/.test(slug)) throw new Error('commercial_campaign_slug_invalid');
  if(!product||!offer||!offerUrl) throw new Error('commercial_campaign_offer_missing');
  if(!Number.isFinite(priceUsd)||priceUsd<=0) throw new Error('commercial_campaign_price_invalid');
  if(!audience) throw new Error('commercial_campaign_audience_missing');
  if(!sourceRefs.length) throw new Error('commercial_campaign_sources_missing');

  const creative={
    eyebrow:clean(input.creative?.eyebrow),
    hook:clean(input.creative?.hook),
    subhook:clean(input.creative?.subhook),
    cta:clean(input.creative?.cta),
    priceLockup:clean(input.creative?.priceLockup)||('$'+priceUsd),
    visualMetaphor:clean(input.creative?.visualMetaphor),
    palette:{...(input.creative?.palette||{})},
    sonicHook:(input.creative?.sonicHook||[]).map(clean).filter(Boolean),
    guardrails:(input.creative?.guardrails||[]).map(clean).filter(Boolean),
  };
  if(!creative.hook||!creative.cta||!creative.visualMetaphor){
    throw new Error('commercial_campaign_creative_incomplete');
  }

  const deliverables=(input.deliverables||[]).map((item,index)=>({
    id:clean(item?.id)||('format-'+(index+1)),
    width:Number(item?.width),
    height:Number(item?.height),
  }));
  if(deliverables.length<3||deliverables.some(x=>!Number.isInteger(x.width)||!Number.isInteger(x.height)||x.width<320||x.height<320)){
    throw new Error('commercial_campaign_deliverables_invalid');
  }

  const shots=(input.shots||[]).map((shot,index)=>({
    id:clean(shot?.id)||('shot-'+(index+1)),
    beat:clean(shot?.beat)||'coverage',
    durationSec:Number(shot?.durationSec),
    intent:clean(shot?.intent),
    screenText:clean(shot?.screenText),
  }));
  if(shots.length<3||shots.some(x=>!Number.isFinite(x.durationSec)||x.durationSec<=0||!x.intent)){
    throw new Error('commercial_campaign_shots_invalid');
  }

  const normalized={
    schema:input.schema,
    id,
    slug,
    product,
    offer,
    offerUrl,
    priceUsd,
    audience,
    truthState:clean(input.truthState)||'synthetic_visualization',
    sourceRefs,
    creative,
    deliverables,
    shots,
    boundaries:{...(input.boundaries||{})},
  };
  return {...normalized,digest:digest(normalized)};
}

export function compileCommercialAttention(input){
  const campaign=normalizeCommercialCampaign(input);
  const durationSec=Number(campaign.shots.reduce((sum,shot)=>sum+shot.durationSec,0).toFixed(2));
  const planCore={
    schema:'evercraft.graphics-command.commercial-plan.v1',
    campaignId:campaign.id,
    campaignSlug:campaign.slug,
    campaignDigest:campaign.digest,
    treatment:'conversion_leak',
    hero:{
      eyebrow:campaign.creative.eyebrow,
      hook:campaign.creative.hook,
      subhook:campaign.creative.subhook,
      cta:campaign.creative.cta,
      priceLockup:campaign.creative.priceLockup,
      visualPriority:'metaphor_first',
      visualMetaphor:campaign.creative.visualMetaphor,
      maxTextCoverage:0.24,
      focalPoint:'conversion_leak',
      metadataPlacement:'footer_or_detail',
    },
    formats:campaign.deliverables,
    motion:{
      required:true,
      deterministic:true,
      exactFrame:true,
      targetDurationSec:durationSec,
      beats:campaign.shots.map(shot=>({
        id:shot.id,
        beat:shot.beat,
        durationSec:shot.durationSec,
        intent:shot.intent,
        screenText:shot.screenText,
      })),
    },
    sound:{
      originalHook:campaign.creative.sonicHook,
      direction:'rhythmic spoken hook with restrained percussive pulse; words must remain intelligible and ownable',
      generatedAudioRequired:false,
      providerExecutionState:'not_requested',
    },
    truth:{
      state:campaign.truthState,
      sourceRefs:campaign.sourceRefs,
      noObservedCustomerDefectClaim:true,
      noFakeMetric:true,
      syntheticVisualMustNotMasqueradeAsObservedCustomerEvidence:
        campaign.boundaries?.syntheticVisualMustNotMasqueradeAsObservedCustomerEvidence===true,
    },
    council:{
      roles:COUNCIL_ROLES,
      shots:campaign.shots.map(shot=>({
        kind:'fallen_creative_shot',
        key:'commercial-'+campaign.slug+'-'+shot.id,
        shot:{
          id:'commercial-'+campaign.slug+'-'+shot.id,
          sourceType:'generation_request',
          sourceId:campaign.id+':'+shot.id,
          beat:shot.beat,
          durationSec:shot.durationSec,
          aspectRatio:'9:16',
          storyPrompt:campaign.creative.hook+' '+campaign.creative.subhook,
          intent:shot.intent,
          screenText:shot.screenText,
          subjectIds:['website','visitor-flow','conversion-path'],
          coverage:[],
          crew:COUNCIL_ROLES.map(role=>({role})),
        },
      })),
    },
    distribution:{
      offerUrl:campaign.offerUrl,
      destinations:['facebook','instagram','linkedin','tiktok'],
      preferredAssets:{
        facebook:'poster-feed.svg',
        instagram:'poster-feed.svg',
        linkedin:'poster-feed.svg',
        tiktok:'poster-story.svg',
        site:'hero-wide.svg',
      },
    },
    publicationAuthority:false,
  };
  return {...planCore,digest:digest(planCore)};
}

export function assessCommercialScrollStop(plan){
  if(plan?.schema!=='evercraft.graphics-command.commercial-plan.v1'){
    throw new Error('commercial_plan_schema_invalid');
  }
  const checks={
    metaphor_first:plan.hero?.visualPriority==='metaphor_first',
    hook_concise:clean(plan.hero?.hook).length>0&&clean(plan.hero?.hook).length<=34,
    text_subordinate:Number(plan.hero?.maxTextCoverage)<=0.3,
    visual_metaphor_defined:Boolean(clean(plan.hero?.visualMetaphor)),
    focal_point_declared:Boolean(clean(plan.hero?.focalPoint)),
    price_visible:Boolean(clean(plan.hero?.priceLockup)),
    cta_visible:Boolean(clean(plan.hero?.cta)),
    multi_format:(plan.formats?.length||0)>=4,
    motion_ready:plan.motion?.required===true&&plan.motion?.exactFrame===true,
    truth_guarded:plan.truth?.noFakeMetric===true&&plan.truth?.noObservedCustomerDefectClaim===true,
    provenance_present:(plan.truth?.sourceRefs?.length||0)>0,
  };
  const values=Object.values(checks);
  const passed=values.filter(Boolean).length;
  const score=Number((passed/values.length).toFixed(3));
  return {
    schema:'evercraft.graphics-command.commercial-scroll-stop-report.v1',
    planDigest:plan.digest,
    status:score>=0.9?'pass':'reject',
    score,
    checks,
    rule:'This is a structural and source-admission preflight only: the plan must define a leading visual, short copy, formats, exact-frame motion and truth boundaries. A pass does not validate emotional impact, rendered footage, visual beauty or video performance.',
    evaluationScope:'plan_structure_only',
    creativeQualityState:'not_observed',
    cinematicApproval:false,
    publicationAuthority:false,
  };
}
