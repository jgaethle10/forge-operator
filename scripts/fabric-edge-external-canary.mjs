#!/usr/bin/env node
import dns from 'node:dns/promises';
import tls from 'node:tls';
import net from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../systemia/compute/device-identity.mjs';
import { classifyPublicEdgeIngress } from '../systemia/network/public-edge-ingress-watch.mjs';
import { diagnoseExternalEdgeLayers } from '../systemia/network/public-edge-layer-diagnosis.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');
const clean=(v)=>String(v??'').trim();
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const origin=clean(arg('--origin','https://fabric.systemiacommandcenters.com')).replace(/\/+$/,'');
const url=new URL(origin);
if(url.protocol!=='https:') throw new Error('operator_public_edge_requires_https');
if(/(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('operator_public_edge_must_not_use_base44');
if(url.pathname!=='/'&&url.pathname!=='') throw new Error('origin_must_not_include_path');

async function inspectTcp(hostname,port,timeoutMs=4000){
  return await new Promise((resolve)=>{
    const startedAt=Date.now();
    const socket=net.createConnection({host:hostname,port});
    let settled=false;
    const done=(reachable,error=null)=>{
      if(settled) return;
      settled=true;
      socket.destroy();
      resolve({
        port,
        reachable,
        latency_ms:reachable?Date.now()-startedAt:null,
        error:error?clean(error):null,
      });
    };
    socket.setTimeout(timeoutMs,()=>done(false,'timeout'));
    socket.once('connect',()=>done(true));
    socket.once('error',(error)=>done(false,error?.code||error?.message||error));
  });
}

async function inspectTls(hostname){
  return await new Promise((resolve,reject)=>{
    const socket=tls.connect({
      host:hostname,
      port:443,
      servername:hostname,
      rejectUnauthorized:true,
    },()=>{
      try{
        const cert=socket.getPeerCertificate(true);
        if(!cert||!cert.fingerprint256) throw new Error('tls_peer_certificate_unavailable');
        const validTo=Date.parse(cert.valid_to||'');
        if(!Number.isFinite(validTo)||validTo<=Date.now()) throw new Error('tls_certificate_expired_or_unreadable');
        resolve({
          authorized:socket.authorized===true,
          authorization_error:socket.authorizationError||null,
          fingerprint256:cert.fingerprint256,
          subject:cert.subject||null,
          issuer:cert.issuer||null,
          valid_from:cert.valid_from||null,
          valid_to:cert.valid_to||null,
          days_remaining:Number(((validTo-Date.now())/86400000).toFixed(2)),
        });
      }catch(error){reject(error);}
      finally{socket.end();}
    });
    socket.setTimeout(10000,()=>socket.destroy(new Error('tls_probe_timeout')));
    socket.once('error',reject);
  });
}

async function timedFetch(target,options={},timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(target,{...options,signal:controller.signal,redirect:'follow'});}
  finally{clearTimeout(timer);}
}
async function getText(path){
  const r=await timedFetch(origin+path,{headers:{'user-agent':'Evercraft-Operator-Edge-Canary/1.0'}});
  if(!r.ok) throw new Error('http_'+r.status+':'+path);
  return {response:r,text:await r.text()};
}
async function getJson(path){
  const r=await timedFetch(origin+path,{headers:{accept:'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'}});
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body) throw new Error('json_http_'+r.status+':'+path);
  return body;
}
async function postJson(path,payload){
  const r=await timedFetch(origin+path,{
    method:'POST',
    headers:{
      accept:'application/json',
      'content-type':'application/json',
      'user-agent':'Evercraft-Operator-Edge-Canary/1.0'
    },
    body:JSON.stringify(payload)
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body) throw new Error('json_post_http_'+r.status+':'+path);
  return body;
}
async function rpcAt(path,id,method,params={}){
  const r=await timedFetch(origin+path,{
    method:'POST',
    headers:{'content-type':'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body) throw new Error('mcp_http_'+r.status+':'+method);
  if(body.error) throw new Error('mcp_'+method+':'+clean(body.error.message));
  return body.result;
}
async function rpc(id,method,params={}){
  return rpcAt('/mcp',id,method,params);
}

function failureStage(checks={},message=''){
  if(checks.public_dns!==true) return 'public_dns';
  if(checks.trusted_tls!==true) {
    if(/timeout|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET/i.test(message)){
      return 'public_tcp_tls_ingress';
    }
    return 'trusted_tls';
  }
  if(checks.customer_surface!==true) return 'customer_surface';
  if(checks.aliev_surface!==true) return 'aliev_surface';
  if(checks.journal_surface!==true) return 'journal_surface';
  if(checks.visual_desk!==true) return 'visual_desk';
  if(checks.faie_surface!==true) return 'faie_surface';
  if(checks.faie_design_partner_surface!==true) return 'faie_design_partner_surface';
  if(checks.faie_design_partner_investigation!==true) return 'faie_design_partner_investigation';
  if(checks.faie_health!==true) return 'faie_health';
  if(checks.faie_mcp!==true) return 'faie_mcp';
  if(checks.mobile_surface!==true) return 'mobile_surface';
  if(checks.offer_storefront!==true) return 'offer_storefront';
  if(checks.policy_surfaces!==true) return 'policy_surfaces';
  if(checks.runtime_health!==true) return 'runtime_health';
  if(checks.mcp_sse_probe!==true) return 'mcp_sse_probe';
  if(checks.device_attestation!==true) return 'device_attestation';
  if(checks.mcp_initialize!==true) return 'mcp_initialize';
  if(checks.mcp_tools!==true) return 'mcp_tools';
  if(checks.lineage_surface!==true) return 'lineage_surface';
  if(checks.public_catalog!==true) return 'public_catalog';
  return 'unknown';
}

const started=new Date().toISOString();
const receipt={
  schema:'evercraft.operator-public-edge.external-canary.v1',
  origin,
  hostname:url.hostname,
  trust_class:'operator_authorized_public_edge',
  physical_field_certified:false,
  founder_login_required:false,
  base44_transport_required:false,
  verified:false,
  checks:{},
  observed_at:started,
};

try{
  const addresses=await dns.resolve4(url.hostname);
  if(!addresses.length) throw new Error('public_dns_no_ipv4');
  receipt.dns_ipv4=addresses;
  receipt.checks.public_dns=true;

  // Keep authoritative DNS provenance in the failure receipt. This lets the
  // Repair Unit distinguish a dead application edge from a DNS control-plane
  // problem without asking the founder to reconstruct the zone by hand.
  const zone=url.hostname.split('.').slice(-2).join('.');
  receipt.dns_zone=zone;
  try{
    receipt.dns_nameservers=(await dns.resolveNs(zone)).sort();
  }catch(nsError){
    receipt.dns_nameservers=[];
    receipt.dns_nameserver_error=clean(nsError?.message||nsError);
  }
  try{
    receipt.dns_cname=(await dns.resolveCname(url.hostname)).sort();
  }catch{
    receipt.dns_cname=[];
  }
  const [tcp80,tcp443]=await Promise.all([
    inspectTcp(url.hostname,80),
    inspectTcp(url.hostname,443),
  ]);
  receipt.public_tcp={
    http_80:tcp80,
    https_443:tcp443,
  };
  receipt.checks.public_tcp_80=tcp80.reachable===true;
  receipt.checks.public_tcp_443=tcp443.reachable===true;

  const tlsPeer=await inspectTls(url.hostname);
  if(tlsPeer.authorized!==true) throw new Error('tls_peer_not_authorized');
  receipt.tls=tlsPeer;
  receipt.checks.trusted_tls=true;

  const home=await getText('/');
  if(!/Evercraft Fabric|Bring the problem\./i.test(home.text)) throw new Error('fabric_home_identity_missing');
  receipt.checks.customer_surface=true;

  const alievPage=await getText('/aliev');
  const alievContentType=alievPage.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(alievContentType)) throw new Error('aliev_surface_not_html');
  if(!/AliEV intelligence layer/i.test(alievPage.text)||!/The engine behind/i.test(alievPage.text)){
    throw new Error('aliev_surface_identity_missing');
  }
  if(/base44\.app/i.test(alievPage.text)) throw new Error('aliev_surface_base44_reference');
  receipt.aliev_surface={
    path:'/aliev',
    url:origin+'/aliev',
    status:alievPage.response.status,
    content_type:alievContentType,
    identity_verified:true,
    base44_reference_absent:true,
  };
  receipt.checks.aliev_surface=true;

  const journalIndex=await getJson('/journal/index.json');
  if(journalIndex.schema!=='evercraft.journal.index.v1') throw new Error('journal_index_schema_invalid');
  if(journalIndex.live_edition!==true||!Array.isArray(journalIndex.stories)||journalIndex.stories.length<1){
    throw new Error('journal_live_edition_missing');
  }
  const journalStory=journalIndex.stories[0];
  const journalSlug=clean(journalStory.slug);
  const journalStoryId=clean(journalStory.story_id);
  const journalCanonical=origin+'/journal/'+journalSlug+'/';
  if(!journalSlug||!journalStoryId) throw new Error('journal_live_identity_missing');
  if(clean(journalStory.canonical_url)!==journalCanonical) throw new Error('journal_index_canonical_origin_drift');

  const journalArticle=await getText('/journal/'+journalSlug+'/');
  if(!/^text\/html/i.test(journalArticle.response.headers.get('content-type')||'')){
    throw new Error('journal_article_not_html');
  }
  if(!journalArticle.text.includes('<meta name="evercraft:story_id" content="'+journalStoryId+'">')){
    throw new Error('journal_article_story_id_drift');
  }
  if(!journalArticle.text.includes('<link rel="canonical" href="'+journalCanonical+'">')){
    throw new Error('journal_article_canonical_drift');
  }
  if(!journalArticle.text.includes('<meta property="og:url" content="'+journalCanonical+'">')){
    throw new Error('journal_article_og_url_drift');
  }
  if(/journal\.evercraft\.global/i.test(journalArticle.text)){
    throw new Error('journal_dead_canonical_domain_regressed');
  }
  receipt.journal_surface={
    index:'/journal/index.json',
    article:'/journal/'+journalSlug+'/',
    story_id:journalStoryId,
    slug:journalSlug,
    canonical_url:journalCanonical,
    identity_verified:true,
    dead_canonical_domain_absent:true,
  };
  receipt.checks.journal_surface=true;

  const visualHome=await getText('/visuals/');
  const visualContentType=visualHome.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(visualContentType)) throw new Error('visual_desk_not_html');
  if(!/Evercraft Visual Desk|physical world, made legible/i.test(visualHome.text)) throw new Error('visual_desk_identity_missing');

  const visualCatalog=await getJson('/visuals/index.json');
  if(visualCatalog.schema!=='evercraft.fabric.visual-desk-index.v1') throw new Error('visual_desk_catalog_schema_invalid');
  if(Number(visualCatalog.count)<1) throw new Error('visual_desk_catalog_empty');
  const specimen=(visualCatalog.stories||[]).find((story)=>story.slug==='washington-active-volcanoes');
  if(!specimen) throw new Error('visual_desk_specimen_missing');

  const specimenPage=await getText('/visuals/washington-active-volcanoes/');
  if(!/Washington/i.test(specimenPage.text)||!/usgs\.gov/i.test(specimenPage.text)){
    throw new Error('visual_desk_specimen_identity_missing');
  }
  const vertical=await getText('/visuals/washington-active-volcanoes/card-story.svg');
  if(!/^image\/svg\+xml/i.test(vertical.response.headers.get('content-type')||'')){
    throw new Error('visual_desk_story_card_not_svg');
  }
  if(!/height="1920"/.test(vertical.text)) throw new Error('visual_desk_story_card_shape_invalid');

  const directedFeed=await getText('/visuals/washington-active-volcanoes/poster-feed.svg');
  if(!/^image\/svg\+xml/i.test(directedFeed.response.headers.get('content-type')||'')){
    throw new Error('graphics_command_poster_not_svg');
  }
  if(!/5 ACTIVE VOLCANOES/.test(directedFeed.text)) throw new Error('graphics_command_hook_missing');
  if(!/class="geo-boundary"/.test(directedFeed.text)||!/class="peak-marker"/.test(directedFeed.text)){
    throw new Error('graphics_command_state_geometry_missing');
  }
  if(
    !/data-visual-model="cinematic-terrain-geography-v2"/.test(directedFeed.text)||
    !/<image class="terrain-relief"/.test(directedFeed.text)||
    !/href="data:image\/png;base64,/.test(directedFeed.text)||
    !/data-source-sha256="[a-f0-9]{64}"/.test(directedFeed.text)||
    !/class="story-route cascade-axis"[^>]*opacity=".085"/.test(directedFeed.text)||
    /class="peak-halo"/.test(directedFeed.text)||
    /<circle class="peak-marker"/.test(directedFeed.text)
  ){
    throw new Error('graphics_command_cinematic_geography_missing');
  }
  if(!/WASHINGTON/.test(directedFeed.text)) throw new Error('graphics_command_region_identity_missing');
  if(/Digest/i.test(directedFeed.text)) throw new Error('graphics_command_audit_clutter_regressed');

  const terrainResponse=await timedFetch(origin+'/visuals/washington-active-volcanoes/terrain-relief.png',{
    headers:{'user-agent':'evercraft-owned-edge-canary/1.0'}
  });
  if(!terrainResponse.ok) throw new Error('graphics_command_terrain_relief_missing');
  if(!/^image\/png/i.test(terrainResponse.headers.get('content-type')||'')){
    throw new Error('graphics_command_terrain_relief_not_png');
  }
  const terrainBytes=Buffer.from(await terrainResponse.arrayBuffer());
  if(terrainBytes.length<25000) throw new Error('graphics_command_terrain_relief_too_small');
  const terrainSha256=createHash('sha256').update(terrainBytes).digest('hex');

  const directedStory=await getText('/visuals/washington-active-volcanoes/poster-story.svg');
  if(!/height="1920"/.test(directedStory.text)) throw new Error('graphics_command_story_shape_invalid');
  if(!/>5 ACTIVE<\/text>/.test(directedStory.text)||!/>VOLCANOES<\/text>/.test(directedStory.text)){
    throw new Error('graphics_command_story_headline_bounds_regressed');
  }

  const graphicsPlan=await getJson('/visuals/washington-active-volcanoes/graphics-plan.json');
  if(graphicsPlan.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_command_plan_schema_invalid');
  if(graphicsPlan.treatment!=='geo_spine'||graphicsPlan.hero?.visualPriority!=='hero_first'){
    throw new Error('graphics_command_art_direction_invalid');
  }
  if(
    graphicsPlan.geography?.boundaryName!=='Washington'||
    graphicsPlan.geography?.boundaryLicense!=='CC0-1.0'||
    graphicsPlan.geography?.boundaryRightsState!=='public_domain'
  ){
    throw new Error('graphics_command_boundary_lineage_missing');
  }
  if(
    graphicsPlan.geography?.terrain?.id!=='usgs-wa-shaded-relief-3dep-v1'||
    graphicsPlan.geography?.terrain?.rightsState!=='public_domain'||
    graphicsPlan.geography?.terrain?.license!=='US-PD'||
    graphicsPlan.geography?.terrain?.sourceSha256!==terrainSha256||
    !/USGSShadedReliefOnly/.test(graphicsPlan.geography?.terrain?.sourceRef||'')
  ){
    throw new Error('graphics_command_terrain_lineage_missing');
  }
  if(graphicsPlan.publicationAuthority!==false) throw new Error('graphics_command_publication_authority_invalid');

  const scrollStop=await getJson('/visuals/washington-active-volcanoes/scroll-stop-report.json');
  if(scrollStop.schema!=='evercraft.graphics-command.scroll-stop-report.v1'||scrollStop.status!=='pass'){
    throw new Error('graphics_command_scroll_stop_not_passed');
  }

  const posterQuality=await getJson('/visuals/washington-active-volcanoes/poster-quality-report.json');
  if(posterQuality.schema!=='evercraft.graphics-command.poster-quality-report.v1'||posterQuality.status!=='pass'){
    throw new Error('graphics_command_poster_quality_not_passed');
  }
  for(const format of ['feed','square','story']){
    const report=posterQuality.formats?.[format];
    if(
      report?.status!=='pass'||
      report?.checks?.labelsNonOverlapping!==true||
      report?.checks?.labelsClearOfOtherMarkers!==true||
      report?.checks?.markersNonOverlapping!==true||
      report?.checks?.safeMargins!==true||
      report?.checks?.regionIdentityClear!==true
    ){
      throw new Error('graphics_command_layout_quality_invalid:'+format);
    }
  }

  const fallenStageInput=await getJson('/visuals/washington-active-volcanoes/fallen-stage-input.json');
  if(fallenStageInput.aspectRatio!=='9:16') throw new Error('graphics_command_fallen_aspect_invalid');
  if((fallenStageInput.map?.points||[]).length!==5||(fallenStageInput.map?.routes||[]).length!==4){
    throw new Error('graphics_command_fallen_geo_handoff_invalid');
  }
  const fallenPolygons=fallenStageInput.map?.polygons||[];
  if(
    fallenPolygons.length!==1||
    fallenPolygons[0]?.id!=='us-wa-state-outline-cc0-v1'||
    (fallenPolygons[0]?.rings?.[0]?.length||0)<70
  ){
    throw new Error('graphics_command_fallen_polygon_missing');
  }

  const storyPreview=await getText('/visuals/washington-active-volcanoes/poster-story.html');
  if(!/max-height:calc\(100svh - 58px\)/.test(storyPreview.text)||!/poster-story\.svg/.test(storyPreview.text)){
    throw new Error('graphics_command_responsive_preview_missing');
  }

  const motion=await getText('/visuals/washington-active-volcanoes/motion.html');
  if(!/__evercraftRenderAt/.test(motion.text)||!/__evercraftRenderFrame/.test(motion.text)){
    throw new Error('visual_desk_motion_controls_missing');
  }
  if(!/evercraft\.visual-story\.motion-stage\.v2/.test(motion.text)||!/.story-route/.test(motion.text)){
    throw new Error('graphics_command_directed_motion_missing');
  }
  const negativeVisualIngest=await timedFetch(origin+'/api/visuals/ingest',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'user-agent':'Evercraft-Operator-Edge-Canary/1.0',
    },
    body:'{}',
  });
  const negativeVisualIngestBody=await negativeVisualIngest.json().catch(()=>null);
  if(negativeVisualIngest.status===404){
    throw new Error('visual_desk_ingest_route_not_deployed');
  }
  if(
    negativeVisualIngest.status===503&&
    negativeVisualIngestBody?.error==='visual_ingest_not_configured'
  ){
    throw new Error('visual_desk_ingest_credential_not_ready');
  }
  if(
    negativeVisualIngest.status!==401||
    negativeVisualIngestBody?.error!=='visual_ingest_unauthorized'
  ){
    throw new Error('visual_desk_ingest_auth_gate_failed');
  }

  receipt.visual_desk={
    path:'/visuals/',
    story_count:Number(visualCatalog.count),
    specimen:'washington-active-volcanoes',
    story_card:'/visuals/washington-active-volcanoes/card-story.svg',
    directed_poster:'/visuals/washington-active-volcanoes/poster-feed.svg',
    directed_story:'/visuals/washington-active-volcanoes/poster-story.svg',
    graphics_plan:'/visuals/washington-active-volcanoes/graphics-plan.json',
    scroll_stop_status:scrollStop.status,
    poster_quality_status:posterQuality.status,
    poster_quality_formats:Object.fromEntries(
      Object.entries(posterQuality.formats||{}).map(([format,report])=>[
        format,
        {
          status:report.status,
          issue_count:Number(report.issueCount||0),
          labels_non_overlapping:report.checks?.labelsNonOverlapping===true,
          labels_clear_of_other_markers:report.checks?.labelsClearOfOtherMarkers===true,
          region_identity_clear:report.checks?.regionIdentityClear===true,
        }
      ])
    ),
    fallen_stage_aspect:fallenStageInput.aspectRatio,
    fallen_geo_polygon_count:fallenPolygons.length,
    boundary_name:graphicsPlan.geography.boundaryName,
    boundary_license:graphicsPlan.geography.boundaryLicense,
    boundary_rights_state:graphicsPlan.geography.boundaryRightsState,
    responsive_story_preview:'/visuals/washington-active-volcanoes/poster-story.html',
    directed_motion_v2:true,
    graphics_command_verified:true,
    motion_stage:'/visuals/washington-active-volcanoes/motion.html',
    source_backed:/usgs\.gov/i.test(specimenPage.text),
    ingest_path:'/api/visuals/ingest',
    unauthenticated_ingest_status:negativeVisualIngest.status,
    unauthenticated_ingest_blocked:true,
  };
  receipt.checks.visual_desk=true;

  const faiePage=await getText('/faie/');
  const faieContentType=faiePage.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(faieContentType)) throw new Error('faie_surface_not_html');
  if(!/Evidence for the physical world/i.test(faiePage.text)) throw new Error('faie_surface_identity_missing');
  if(!/Run live AgNormal brief/i.test(faiePage.text)) throw new Error('faie_agnormal_partner_experience_missing');
  if(!/Official MCP Registry/i.test(faiePage.text)) throw new Error('faie_registry_proof_missing');
  if(/placeholder="greenhouse"/i.test(faiePage.text)) throw new Error('faie_undisclosed_architecture_assumption_regressed');
  if(/base44\.app/i.test(faiePage.text)) throw new Error('faie_surface_base44_reference');
  receipt.faie_surface={
    status:faiePage.response.status,
    content_type:faieContentType,
    identity_verified:true,
    agnormal_design_partner_experience:true,
    registry_proof_visible:true,
    undisclosed_architecture_assumption_absent:true,
    url:origin+'/faie/',
  };
  receipt.checks.faie_surface=true;

  const agnormalPage=await getText('/faie/agnormal/');
  const agnormalContentType=agnormalPage.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(agnormalContentType)) throw new Error('faie_agnormal_surface_not_html');
  if(!/Prepared for AgNormal/i.test(agnormalPage.text)) throw new Error('faie_agnormal_partner_identity_missing');
  if(!/One real decision\. Live evidence\. No theater\./i.test(agnormalPage.text)) throw new Error('faie_agnormal_partner_promise_missing');
  if(!/id="activityHud"/.test(agnormalPage.text)) throw new Error('faie_agnormal_activity_hud_missing');
  if(!/Cancel operation/.test(agnormalPage.text)) throw new Error('faie_agnormal_cancel_control_missing');
  if(!/Download handed off/.test(agnormalPage.text)) throw new Error('faie_agnormal_truthful_download_receipt_missing');
  if(/base44\.app/i.test(agnormalPage.text)) throw new Error('faie_agnormal_base44_reference');
  receipt.faie_design_partner_surface={
    path:'/faie/agnormal/',
    url:origin+'/faie/agnormal/',
    status:agnormalPage.response.status,
    content_type:agnormalContentType,
    partner_identity_verified:true,
    activity_hud_verified:true,
    cancel_control_verified:true,
    truthful_download_handoff_verified:true,
    base44_reference_absent:true,
  };
  receipt.checks.faie_design_partner_surface=true;

  const agnormalInvestigation=await postJson('/api/faie/investigate',{
    question:'What current evidence could materially weaken reliance on Yakima Valley water availability for regionally scaled food production?',
    region_keys:['yakima-wa'],
    asset_types:['regional food production infrastructure'],
    water_source:'Yakima River Basin irrigation and groundwater',
    thesis_assumptions:[
      'Regional water availability can support the target production system.',
      'Water constraints must be resolved before consequential capital decisions rely on the thesis.'
    ],
    horizon_days:90
  });
  if(agnormalInvestigation.schema!=='evercraft.faie.investigation.v1'){
    throw new Error('faie_agnormal_investigation_schema_invalid');
  }
  if(!Array.isArray(agnormalInvestigation.findings)||!Array.isArray(agnormalInvestigation.unknowns)){
    throw new Error('faie_agnormal_investigation_evidence_shape_invalid');
  }
  if(agnormalInvestigation.decision_packet?.framework!=='SENSE_CHALLENGE_DECIDE'){
    throw new Error('faie_agnormal_decision_packet_framework_invalid');
  }
  if(
    agnormalInvestigation.decision_packet?.decide?.human_review_required!==true||
    agnormalInvestigation.decision_packet?.decide?.action_authority!==false||
    agnormalInvestigation.decision_authority!==false||
    agnormalInvestigation.publication_authority!==false
  ){
    throw new Error('faie_agnormal_authority_boundary_failed');
  }
  if(!Array.isArray(agnormalInvestigation.evidence_acquisition_queue)){
    throw new Error('faie_agnormal_next_proof_queue_missing');
  }
  receipt.faie_design_partner_investigation={
    schema:agnormalInvestigation.schema,
    status:agnormalInvestigation.status,
    finding_count:agnormalInvestigation.findings.length,
    unknown_count:agnormalInvestigation.unknowns.length,
    evidence_readiness:agnormalInvestigation.coverage?.decision_readiness||null,
    next_proof_count:agnormalInvestigation.evidence_acquisition_queue.length,
    human_review_required:true,
    action_authority:false,
    decision_authority:false,
    publication_authority:false,
  };
  receipt.checks.faie_design_partner_investigation=true;

  const faieHealth=await getJson('/api/faie/health');
  if(faieHealth.fabric_native!==true) throw new Error('faie_health_not_fabric_native');
  if(faieHealth.public_surface!=='/faie/') throw new Error('faie_health_public_path_mismatch');
  if(faieHealth.design_partner_surface!=='/faie/agnormal/') throw new Error('faie_health_design_partner_path_mismatch');
  if(faieHealth.public_mcp!=='/mcp/faie') throw new Error('faie_health_mcp_path_mismatch');
  if(faieHealth.base44_transport_enabled!==false) throw new Error('faie_health_base44_transport_enabled');
  if(faieHealth.decision_authority!==false||faieHealth.publication_authority!==false){
    throw new Error('faie_health_authority_boundary_failed');
  }
  receipt.faie_health={
    ok:faieHealth.ok===true,
    signal_count:Number(faieHealth.signal_count||0),
    observation_count:Number(faieHealth.observation_count||0),
    public_surface:faieHealth.public_surface,
    design_partner_surface:faieHealth.design_partner_surface,
    public_mcp:faieHealth.public_mcp,
    fabric_native:true,
    base44_transport_enabled:false,
  };
  receipt.checks.faie_health=true;

  const faieInit=await rpcAt('/mcp/faie',101,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-faIE-public-edge-canary',version:'1'},
  });
  if(faieInit?.serverInfo?.name!=='evercraft-faie') throw new Error('faie_mcp_identity_mismatch');
  const faieTools=await rpcAt('/mcp/faie',102,'tools/list',{});
  const faieToolNames=(faieTools?.tools||[]).map((tool)=>clean(tool.name));
  for(const expected of ['investigate_faie_evidence','compare_faie_candidates','get_faie_signal_snapshot','get_faie_health']){
    if(!faieToolNames.includes(expected)) throw new Error('faie_mcp_tool_missing:'+expected);
  }
  receipt.faie_mcp={
    server:faieInit.serverInfo.name,
    tools:faieToolNames,
    url:origin+'/mcp/faie',
  };
  receipt.checks.faie_mcp=true;

  const mobile=await getText('/mobile');
  const mobileContentType=mobile.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(mobileContentType)) throw new Error('mobile_surface_not_html');
  if(!/Evercraft Mobile|Bring the problem\./i.test(mobile.text)) throw new Error('mobile_surface_identity_missing');
  receipt.mobile_surface={
    status:mobile.response.status,
    content_type:mobileContentType,
    identity_verified:true,
  };
  receipt.checks.mobile_surface=true;

  const offerDirectory=await getText('/offers');
  if(!/^text\/html/i.test(offerDirectory.response.headers.get('content-type')||'')) throw new Error('offer_directory_not_html');
  if(!/One problem\.|One clear offer\./i.test(offerDirectory.text)) throw new Error('offer_directory_identity_missing');

  const requiredOffers=[
    ['/offers/website-audit',/What you are buying|Quick Win Audit/i,'/api/offers/website-audit/checkout'],
    ['/offers/ibmi-rescue',/IBM i Estate X-Ray|Don.t touch production/i,'/api/offers/ibmi-rescue/checkout'],
    ['/offers/legacy-rescue',/Legacy Rescue Scan|software is broken/i,'/api/offers/legacy-rescue/checkout'],
    ['/offers/findmypart',/Quick Hunt|Can.t find the part/i,'/api/offers/findmypart/checkout'],
  ];
  receipt.offer_storefront={directory_status:offerDirectory.response.status,pages:[]};
  for(const [path,identity,checkoutPath] of requiredOffers){
    const page=await getText(path);
    const contentType=page.response.headers.get('content-type')||'';
    if(!/^text\/html/i.test(contentType)) throw new Error('offer_page_not_html:'+path);
    if(!identity.test(page.text)) throw new Error('offer_page_identity_missing:'+path);
    if(!page.text.includes('action="'+checkoutPath+'"')) throw new Error('offer_checkout_action_missing:'+path);
    if(!/Evercraft Payments/i.test(page.text)) throw new Error('offer_payment_authority_missing:'+path);
    receipt.offer_storefront.pages.push({
      path,
      status:page.response.status,
      identity_verified:true,
      checkout_action:checkoutPath,
      payment_authority:'Evercraft Payments',
    });
  }

  const negativeCheckout=await timedFetch(origin+'/api/offers/website-audit/checkout',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'user-agent':'Evercraft-Operator-Edge-Canary/1.0',
    },
    body:'{}',
  });
  const negativeBody=await negativeCheckout.json().catch(()=>null);
  if(negativeCheckout.status!==409||negativeBody?.error!=='explicit_user_confirmation_required'){
    throw new Error('offer_checkout_confirmation_gate_failed');
  }
  receipt.offer_storefront.negative_confirmation={
    status:negativeCheckout.status,
    error:negativeBody.error,
    checkout_created:false,
  };
  const missingHandoff=await timedFetch(origin+'/checkout/handoff/canary-missing-token',{
    method:'GET',
    headers:{
      'accept':'text/html',
      'user-agent':'Evercraft-Operator-Edge-Canary/1.0',
    },
  });
  const missingHandoffBody=await missingHandoff.text();
  if(missingHandoff.status!==410) throw new Error('checkout_handoff_missing_token_status_'+missingHandoff.status);
  if(!/Evercraft Payments/i.test(missingHandoffBody)||!/No charge was made\./i.test(missingHandoffBody)){
    throw new Error('checkout_handoff_branded_fail_closed_page_missing');
  }
  receipt.offer_storefront.handoff_route={
    missing_token_status:missingHandoff.status,
    branded_fail_closed:true,
    checkout_created:false,
  };
  receipt.checks.offer_storefront=true;

  for(const path of ['/support','/privacy','/terms']){
    const page=await getText(path);
    if(!/text\/html/i.test(page.response.headers.get('content-type')||'')) throw new Error('policy_not_html:'+path);
  }
  receipt.checks.policy_surfaces=true;

  const health=await getJson('/health');
  if(health.ok!==true) throw new Error('health_not_ok');
  if(health.service!=='evercraft-fabric-local') throw new Error('unexpected_fabric_service');
  if(health.server!=='evercraft-fabric') throw new Error('unexpected_fabric_server');
  if(health.read_only!==true||health.transactional!==false||health.external_action_authority!==false){
    throw new Error('fabric_authority_boundary_failed');
  }
  if(
    health.mcp_read_only!==true||
    health.human_offer_checkout_enabled!==true||
    health.human_offer_checkout_requires_explicit_confirmation!==true||
    health.human_offer_checkout_handoff_mode!=='explicit_evercraft_page'||
    health.payment_authority!=='Evercraft Payments'||
    health.payment_router!=='Raven Nexus'
  ){
    throw new Error('fabric_human_commerce_boundary_failed');
  }
  if(health.base44_transport_enabled!==false) throw new Error('base44_transport_enabled');
  if(health.aliev_public_path!=='/aliev'){
    throw new Error('aliev_health_metadata_missing');
  }
  if(Number(health.capability_count)<40) throw new Error('capability_count_below_floor');
  if(health.mobile_path!=='/mobile'||health.mobile_installable!==true){
    throw new Error('mobile_health_metadata_missing');
  }
  if(
    health.visual_desk_path!=='/visuals/'||
    health.visual_desk_ready!==true||
    Number(health.visual_desk_story_count)<1||
    health.visual_desk_motion_capable!==true||
    health.visual_desk_ingest_path!=='/api/visuals/ingest'||
    health.visual_desk_ingest_ready!==true||
    health.visual_desk_ingest_publication_authority!==false
  ){
    throw new Error('visual_desk_health_metadata_missing');
  }
  receipt.health={
    service:health.service,
    server:health.server,
    version:health.version||null,
    capability_count:Number(health.capability_count),
    read_only:true,
    transactional:false,
    external_action_authority:false,
    base44_transport_enabled:false,
    aliev_public_path:health.aliev_public_path,
    edge_attestation_supported:health.edge_attestation_supported===true,
    mobile_path:health.mobile_path,
    mobile_installable:health.mobile_installable===true,
    visual_desk_path:health.visual_desk_path,
    visual_desk_story_count:Number(health.visual_desk_story_count),
    visual_desk_motion_capable:health.visual_desk_motion_capable===true,
    visual_desk_ingest_path:health.visual_desk_ingest_path,
    visual_desk_ingest_ready:health.visual_desk_ingest_ready===true,
    visual_desk_ingest_publication_authority:false,
  };
  receipt.checks.runtime_health=true;

  // ChatGPT performs a GET/SSE transport probe before normal MCP discovery.
  // Verify that exact path and content type so a dead plugin connection cannot
  // hide behind successful POST-only initialize/tool canaries.
  const sseProbe=await timedFetch(origin+'/mcp',{
    method:'GET',
    headers:{
      accept:'text/event-stream',
      'user-agent':'Evercraft-ChatGPT-SSE-Canary/1.0',
    },
  },10000);
  const sseContentType=sseProbe.headers.get('content-type')||'';
  const sseBody=await sseProbe.text();
  if(!sseProbe.ok) throw new Error('mcp_sse_probe_http_'+sseProbe.status);
  if(!/^text\/event-stream/i.test(sseContentType)) throw new Error('mcp_sse_probe_content_type');
  if(!/evercraft-fabric/i.test(sseBody)) throw new Error('mcp_sse_probe_identity_missing');
  receipt.mcp_sse_probe={
    status:sseProbe.status,
    content_type:sseContentType,
    identity_verified:true,
  };
  receipt.checks.mcp_sse_probe=true;

  if(health.edge_attestation_supported!==true) throw new Error('edge_attestation_not_supported');

  const nonce='edge_'+randomBytes(18).toString('hex');
  const attestationResponse=await timedFetch(origin+'/.well-known/evercraft-edge-attestation',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'},
    body:JSON.stringify({nonce}),
  },10000);
  const attestationBody=await attestationResponse.json().catch(()=>null);
  if(!attestationResponse.ok||attestationBody?.ok!==true||!attestationBody?.attestation){
    throw new Error('edge_attestation_endpoint_failed');
  }
  const verifiedAttestation=verifyNodeAttestation({
    attestation:attestationBody.attestation,
    expectedNonce:nonce,
    maxAgeMs:60000,
    now:new Date(),
  });
  if(verifiedAttestation.ok!==true) throw new Error('edge_attestation_invalid:'+clean(verifiedAttestation.reason));
  if(verifiedAttestation.field_claim!==false) throw new Error('edge_attestation_may_not_claim_field_status');
  receipt.edge_attestation_verified=true;
  receipt.device_fingerprint=verifiedAttestation.device_fingerprint;
  receipt.node_id=verifiedAttestation.node_id;
  receipt.attestation_observed_at=verifiedAttestation.observed_at;
  receipt.attestation_boot_id_hash=verifiedAttestation.boot_id_hash||null;
  receipt.physical_field_claim=false;
  receipt.checks.device_attestation=true;

  const init=await rpc(1,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-operator-edge-canary',version:'1'},
  });
  if(init?.serverInfo?.name!=='evercraft-fabric') throw new Error('mcp_identity_mismatch');
  receipt.checks.mcp_initialize=true;

  const tools=await rpc(2,'tools/list',{});
  const names=(tools?.tools||[]).map(x=>clean(x.name));
  for(const expected of ['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options']){
    if(!names.includes(expected)) throw new Error('mcp_tool_missing:'+expected);
  }
  receipt.mcp_tools=names;
  receipt.checks.mcp_tools=true;

  const catalog=await rpc(3,'tools/call',{
    name:'list_evercraft_capabilities',
    arguments:{limit:100},
  });
  const payload=catalog?.structuredContent||null;
  if(!payload||Number(payload.total)<40) throw new Error('fabric_catalog_unavailable');
  if(payload.transactional!==false||payload.external_action_taken!==false) throw new Error('fabric_catalog_side_effect_boundary_failed');
  if(/base44\.app/i.test(JSON.stringify(payload.capabilities||[]))) throw new Error('base44_route_leaked_into_catalog');

  const lineage=(payload.capabilities||[]).find((item)=>item.public_id==='lineage-founding-pilot-v1');
  if(!lineage) throw new Error('lineage_catalog_missing');
  if(lineage.state!=='human_handoff_ready') throw new Error('lineage_machine_state_drift');
  if(lineage.commercial_state!=='verification_required') throw new Error('lineage_commercial_state_drift');
  if(Number(lineage.entry_paid_offer?.price_usd_normalized)!==500) throw new Error('lineage_founding_pilot_price_drift');

  const lineagePath='/capabilities/lineage-founding-pilot-v1';
  const lineagePage=await getText(lineagePath);
  const lineageType=lineagePage.response.headers.get('content-type')||'';
  if(!/^text\/html/i.test(lineageType)) throw new Error('lineage_public_page_not_html');
  if(!/Evercraft Lineage Founding Pilot/i.test(lineagePage.text)) throw new Error('lineage_public_page_identity_missing');
  if(!/\$500/.test(lineagePage.text)) throw new Error('lineage_public_page_price_missing');
  if(/base44\.app/i.test(lineagePage.text)) throw new Error('lineage_public_page_base44_reference');
  if(/buy\.stripe\.com/i.test(lineagePage.text)) throw new Error('lineage_direct_processor_checkout_leak');
  if(/Continue to checkout/i.test(lineagePage.text)) throw new Error('lineage_unverified_checkout_leak');

  receipt.lineage_surface={
    path:lineagePath,
    url:origin+lineagePath,
    status:lineagePage.response.status,
    content_type:lineageType,
    public_id:lineage.public_id,
    machine_state:lineage.state,
    commercial_state:lineage.commercial_state,
    price_usd:Number(lineage.entry_paid_offer?.price_usd_normalized),
    human_confirmed:true,
    automatic_repository_access:false,
    automatic_payment:false,
    direct_processor_checkout:false,
  };
  receipt.checks.lineage_surface=true;

  receipt.catalog_total=Number(payload.total);
  receipt.checks.public_catalog=true;

  receipt.ingress_diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{ok:true,addresses:receipt.dns_ipv4||[]},
    external:{
      state:'verified',
      tcp_reachable:true,
      tls_reachable:true,
      http_reachable:true,
      status:200,
      source:'github_actions_external_canary',
      observed_at:new Date().toISOString(),
    },
  });
  receipt.network_layers=diagnoseExternalEdgeLayers({
    checks:receipt.checks,
    publicTcp:receipt.public_tcp,
    compositeVerified:true,
  });
  receipt.verified=true;
  receipt.state='public_https_verified';
  receipt.public_https_verified=true;
  receipt.mcp_verified=true;
  receipt.external_route_verified=true;
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}catch(error){
  receipt.state='verification_failed';
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.error_code=clean(error?.code||'')||null;
  receipt.error_name=clean(error?.name||'')||null;
  receipt.failure_stage=failureStage(receipt.checks,receipt.error);
  receipt.network_layers=diagnoseExternalEdgeLayers({
    checks:receipt.checks,
    publicTcp:receipt.public_tcp,
    failureStage:receipt.failure_stage,
    error:receipt.error,
    compositeVerified:false,
  });
  const tcpLike=/timeout|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET/i.test(receipt.error);
  receipt.ingress_diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{
      ok:receipt.checks.public_dns===true,
      addresses:receipt.dns_ipv4||[],
    },
    external:{
      state:receipt.failure_stage,
      tcp_reachable:receipt.failure_stage==='public_tcp_tls_ingress'&&tcpLike?false:null,
      tls_reachable:receipt.checks.trusted_tls===true?true:
        (receipt.failure_stage==='public_tcp_tls_ingress'||receipt.failure_stage==='trusted_tls'?false:null),
      http_reachable:receipt.checks.customer_surface===true?true:
        (receipt.failure_stage==='customer_surface'?false:null),
      source:'github_actions_external_canary',
      observed_at:new Date().toISOString(),
      detail:receipt.error,
    },
  });
  // This runner cannot see the Chromebook loopback from the public Internet.
  // Keep public-path classification useful without laundering an assumption
  // into a local-service health claim.
  receipt.ingress_diagnosis.local_service_ok=null;
  receipt.ingress_diagnosis.local_service_observed=false;
  receipt.ingress_diagnosis.evidence_complete=false;
  receipt.public_https_verified=false;
  receipt.mcp_verified=false;
  receipt.external_route_verified=false;
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stderr.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=1;
}
