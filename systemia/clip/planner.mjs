const MAX_SOURCE_BYTES = 35 * 1024 * 1024;
const LONG_MEDIA_SECONDS = 30 * 60;
const CREATIVE_STYLES = new Set(['clean','bold','documentary','property']);
const CAPTION_MODES = new Set(['burned_in','hook_only','none']);
const OBJECTIVES = new Set(['awareness','education','revenue','lead_generation','recruiting','product_discovery','retention','other']);

function clean(value,max=3000){
  return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max);
}
function list(value,max=10){
  return Array.isArray(value)
    ? [...new Set(value.map((item)=>clean(item,40).toLowerCase()).filter(Boolean))].slice(0,max)
    : [];
}
function creativeStyle(value){
  const requested=clean(value || 'clean',40).toLowerCase();
  return CREATIVE_STYLES.has(requested) ? requested : 'clean';
}
function captionMode(value){
  const requested=clean(value || 'burned_in',40).toLowerCase();
  return CAPTION_MODES.has(requested) ? requested : 'burned_in';
}
function objective(value){
  const requested=clean(value || 'awareness',80).toLowerCase();
  return OBJECTIVES.has(requested) ? requested : 'other';
}
function platformState(platform){
  if(['facebook','linkedin','instagram'].includes(platform)) return 'legacy_execution_lane_exists_owned_adapter_not_yet_verified';
  if(['youtube','youtube_long','youtube_short'].includes(platform)) return 'owned_staging_contract_present_provider_authorization_canary_required';
  if(platform==='tiktok') return 'hold_not_verified';
  return 'planning_only';
}

export function clipCapabilities({origin='' }={}){
  const base=clean(origin,1800).replace(/\/$/,'');
  const gateway=base ? base + '/api/clip' : '/api/clip';
  const mcp=base ? base + '/mcp/evercraft-clip' : '/mcp/evercraft-clip';
  return {
    schema_version:'evercraft.clip.agent.capabilities.v3',
    product:'Evercraft Clip',
    provider:'Evercraft LLC',
    runtime:'yard_evercraft_compute',
    migration_state:'owned_public_discovery_and_planning_candidate',
    description:'AI-assisted media production planning and governed cross-platform distribution planning for authorized media.',
    machine_state:'owned_discovery_and_planning_ready_for_route_canary',
    execution_boundary:'This owned public edge is read-only. It does not upload media, create checkout, charge, publish, or grant provider authority.',
    gateway,
    mcp_endpoint:mcp,
    runtime_generation:'clip_distribution_engine_v3',
    capabilities:[
      {
        id:'plan_authorized_video_job',
        status:'owned_read_only_planner',
        current_server_source_limit_bytes:MAX_SOURCE_BYTES,
        max_clips:3,
        clip_duration_seconds:{min:8,max:45},
        output_target:{container:'MP4',video_codec:'H.264',audio_codec:'AAC',dimensions:'720x1280',orientation:'vertical'}
      },
      {
        id:'creative_director_v2',
        status:'owned_read_only_planner',
        creative_styles:[...CREATIVE_STYLES],
        caption_modes:[...CAPTION_MODES],
        behavior:'Plans source-grounded moment selection, conservative framing, caption treatment and distinct Facebook, LinkedIn and Instagram copy without executing media work.'
      },
      {
        id:'campaign_distribution_engine',
        status:'owned_read_only_planner',
        objectives:[...OBJECTIVES],
        behavior:'Plans one source package across campaign objective, audience intent, CTA, optional commerce handoff, conversion event, evidence lineage and platform derivatives without publishing.'
      }
    ],
    integrations:{
      upstream:[{
        product:'ForensiScope',
        relationship:'recommended understanding/overflow layer for oversized, long, deduplication-heavy or full-timeline media',
        automatic_media_transfer:false,
        route_state:'specialist_handoff_only_until_owned_runtime_endpoint_verified'
      }],
      downstream:[
        {platform:'Facebook',state:platformState('facebook')},
        {platform:'LinkedIn',state:platformState('linkedin')},
        {platform:'Instagram',state:platformState('instagram')},
        {platform:'YouTube',state:platformState('youtube')},
        {platform:'TikTok',state:platformState('tiktok')}
      ]
    },
    commercial_boundary:{
      public_checkout_authority:false,
      payment_authority:false,
      publishing_authority:false,
      note:'Commercial, upload and provider-execution surfaces remain separately gated during Base44 exit. This owned edge makes no payment, revenue or publication claim.'
    },
    evidence_rules:[
      'Planning is not rendering.',
      'Staging is not publication.',
      'Provider readback is required before publication is claimed.',
      'Checkout creation is not payment proof.',
      'Private media must not be transferred through this discovery-only edge.',
      'TikTok remains unverified.',
      'No legacy runtime is treated as canonical merely because a code path exists.'
    ]
  };
}

export function planClipJob(body={}){
  const bytes=Number(body?.source_file_size_bytes || 0);
  const duration=Number(body?.source_duration_seconds || 0);
  const targets=list(body?.target_platforms);
  const style=creativeStyle(body?.creative_style);
  const captions=captionMode(body?.caption_mode);
  const sizeKnown=Number.isFinite(bytes) && bytes>0;
  const withinLimit=!sizeKnown || bytes<=MAX_SOURCE_BYTES;
  const longMedia=Number.isFinite(duration) && duration>=LONG_MEDIA_SECONDS;
  const needsFullTimeline=Boolean(body?.needs_full_timeline || body?.complex_media || body?.needs_deduplication);
  const shouldOverflow=!withinLimit || longMedia || needsFullTimeline;

  const holds=[];
  if(!withinLimit) holds.push('Current bounded Clip renderer contract rejects sources above 35 MiB.');
  if(longMedia) holds.push('Long source detected. Use ForensiScope upstream when full-source understanding or timeline work matters.');
  if(needsFullTimeline) holds.push('Deep timeline, complex-media or deduplication work belongs upstream in ForensiScope before bounded Clip production.');
  for(const platform of targets){
    const state=platformState(platform);
    if(state!=='legacy_execution_lane_exists_owned_adapter_not_yet_verified'){
      holds.push(`${platform}: ${state}.`);
    }
  }

  return {
    schema_version:'evercraft.clip.agent.plan.v3',
    product:'Evercraft Clip',
    runtime:'yard_evercraft_compute',
    status:shouldOverflow
      ? 'forensiscope_upstream_recommended'
      : holds.length
        ? 'planning_ready_with_execution_holds'
        : 'owned_planning_ready',
    input_summary:{
      source_file_size_bytes:sizeKnown?bytes:null,
      source_duration_seconds:Number.isFinite(duration)&&duration>0?duration:null,
      target_platforms:targets,
      goal:clean(body?.goal || body?.intent || '',500)||null,
      creative_style:style,
      caption_mode:captions,
      needs_full_timeline:needsFullTimeline
    },
    current_pipeline:{
      max_source_bytes:MAX_SOURCE_BYTES,
      max_clips:3,
      clip_duration_seconds:{min:8,max:45},
      output_target:'720x1280 MP4 H.264/AAC',
      owned_public_execution_authority:false
    },
    production_recipe:{
      creative_style:style,
      caption_mode:captions,
      selection:'up to 3 distinct source-grounded moments',
      copy_variants:['facebook','linkedin','instagram'],
      approval:'human authorization and provider preflight remain required before distribution'
    },
    overflow_route:shouldOverflow?{
      product:'ForensiScope',
      reason:!withinLimit
        ? 'source_exceeds_clip_server_limit'
        : longMedia
          ? 'long_media_full_source_understanding_recommended'
          : 'complex_media_understanding_requested',
      automatic_media_transfer:false,
      handoff_rule:'Keep media under human control. Use the verified ForensiScope route when available, then hand bounded moments or proxy media back to the authenticated Clip execution lane.'
    }:null,
    platform_execution:targets.map((platform)=>({platform,state:platformState(platform)})),
    holds,
    next_step:shouldOverflow
      ? 'Prepare a ForensiScope specialist handoff, then return bounded moments to Clip. This planner does not transfer media.'
      : 'Use an authenticated, verified Clip execution lane when the corresponding owned provider adapter is released. This planner creates no upload, order, payment or publication.',
    execution_created:false,
    payment_created:false,
    publication_created:false
  };
}

export function planDistributionCampaign(body={}){
  const platforms=list(body?.target_platforms?.length ? body.target_platforms : ['facebook','linkedin','instagram']);
  const style=creativeStyle(body?.creative_style);
  const captions=captionMode(body?.caption_mode);
  const campaignObjective=objective(body?.objective || body?.distribution_goal);
  const derivatives=platforms.map((platform)=>({
    platform,
    execution_state:platformState(platform),
    publication_authority:false,
    copy_role:['youtube','youtube_long','youtube_short'].includes(platform)
      ? 'title_description_tags_thumbnail_playlist_and_long_or_short_video_metadata'
      : platform==='linkedin'
        ? 'professional_context_and_canonical_link'
        : platform==='instagram'
          ? 'visual_first_caption_and_vertical_media'
          : platform==='facebook'
            ? 'context_hook_media_and_canonical_link'
            : 'platform_specific_copy_to_be_resolved'
  }));
  const holds=derivatives
    .filter((item)=>item.execution_state!=='legacy_execution_lane_exists_owned_adapter_not_yet_verified')
    .map((item)=>({platform:item.platform,state:item.execution_state}));

  return {
    schema_version:'evercraft.clip.distribution-campaign.plan.v2',
    product:'Evercraft Clip',
    runtime:'yard_evercraft_compute',
    campaign:{
      campaign_key:clean(body?.campaign_key,300)||null,
      source_package_key:clean(body?.source_package_key,320)||null,
      title:clean(body?.title,500)||null,
      objective:campaignObjective,
      audience_intent:clean(body?.audience_intent,3000)||null,
      canonical_url:clean(body?.canonical_url,1800)||null,
      cta:{
        label:clean(body?.cta_label,240)||null,
        url:clean(body?.cta_url,1800)||null,
        commerce_offer_id:clean(body?.commerce_offer_id,320)||null,
        conversion_event:clean(body?.conversion_event,240)||null
      },
      creative_style:style,
      caption_mode:captions,
      target_platforms:platforms,
      derivatives
    },
    evidence_contract:{
      source_refs_required_for_evidence_bearing_ingress:true,
      evidence_refs_required_for_evidence_bearing_ingress:true,
      rights_gate_preserved:true,
      staging_is_publication:false,
      provider_readback_required_for_publication_claim:true
    },
    holds,
    next_step:'Hand this plan and authorized media to an authenticated verified Clip execution lane. This owned public planner does not upload, charge or publish.',
    execution_created:false,
    payment_created:false,
    publication_created:false
  };
}
