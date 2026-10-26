#!/usr/bin/env node
import { buyerOrderKey, verifyNativePaymentReturn } from './payment-return.mjs';
import { publicPaymentOffer } from './public-payment-offers.mjs';
import { ownedPaymentTransportConfig } from './owned-payment-transport.mjs';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeFabricDirectoryRpc,
  fabricDirectoryTools,
  matchFabricCapabilities,
  loadFabricCatalogFromRepository,
  normalizeFabricCatalog,
  validateOpenAiChallengeToken,
} from './fabric-directory.mjs';
import {ownedDeveloperStatus,renderOwnedDeveloperPage} from './fabric-developer-site.mjs';
import {
  offerCapabilityForSlug,
  offerPurchaseKeyForSlug,
  offerSlugForCapability,
  renderCapabilities,
  renderCapabilityDetail,
  renderFabricHome,
  renderMarkdownDocument,
  renderOfferPage,
  renderOffers,
  listHumanOffers,
  renderPaymentHandoffPage,
  renderPaymentHoldPage,
  renderAliEvLanding,
} from './fabric-public-site.mjs';
import {
  fabricMobileManifest,
  renderFabricMobileApp,
} from './fabric-mobile-site.mjs';
import { renderEarthWorksSimulator } from './earthworks-simulator-page.mjs';
import { createFabricFaieSurface } from './fabric-faie-runtime.mjs';
import { resolveRomanContinuity } from '../domain-shield/roman-funnel.mjs';
import { createStudioInquiryHandler } from './commercial-studio-inquiry.mjs';
import { createStudioAlertDispatcher } from './studio-lead-relay.mjs';
import { buildVisualStory, normalizeVisualStory } from '../visual-desk/factory.mjs';
import { buildCommercialCampaign } from '../graphics-command/commercial-renderer.mjs';

function isLegacyBase44Connection(connection={}) {
  try {
    const url = new URL(String(connection.url||''));
    return /(^|\.)base44\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function nativeOnlyCatalog(input=[]) {
  const normalized=normalizeFabricCatalog(input);
  let removed=0;
  let removedMcp=0;
  const capabilities=normalized.map((item)=>({
    ...item,
    connections:item.connections.filter((connection)=>{
      const legacy=isLegacyBase44Connection(connection);
      if (legacy) {
        removed+=1;
        if (String(connection.type||'').toLowerCase()==='mcp') removedMcp+=1;
      }
      return !legacy;
    }),
  }));
  return {
    capabilities,
    removed_legacy_base44_connections:removed,
    removed_legacy_base44_mcp_connections:removedMcp,
  };
}

function sendJson(res,status,body,extraHeaders={}) {
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'mcp-protocol-version':'2025-03-26',
    ...extraHeaders,
  });
  res.end(data);
}

function sendEventStream(res,status,body,extraHeaders={}) {
  const data=Buffer.from(`event: message\ndata: ${JSON.stringify(body)}\n\n`);
  res.writeHead(status,{
    'content-type':'text/event-stream; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'connection':'keep-alive',
    'x-content-type-options':'nosniff',
    'mcp-protocol-version':'2025-03-26',
    ...extraHeaders,
  });
  res.end(data);
}

function acceptsEventStream(req) {
  return String(req.headers.accept||'')
    .toLowerCase()
    .split(',')
    .map((value)=>value.trim())
    .some((value)=>value==='text/event-stream'||value.startsWith('text/event-stream;'));
}

function browserSecurityHeaders() {
  return {
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
}

function sendText(res,status,body,{contentType='text/plain; charset=utf-8'}={}) {
  const data=Buffer.from(String(body));
  res.writeHead(status,{
    'content-type':contentType,
    'content-length':data.length,
    'cache-control':'public, max-age=300',
    ...browserSecurityHeaders(),
  });
  res.end(data);
}

function sendMobileHtml(res,status,body) {
  const data=Buffer.from(String(body));
  res.writeHead(status,{
    'content-type':'text/html; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  res.end(data);
}

function sendInteractiveHtml(res,status,body) {
  const data=Buffer.from(String(body));
  res.writeHead(status,{
    'content-type':'text/html; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'none'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  res.end(data);
}

function sendBuffer(res,status,data,{contentType='application/octet-stream',cacheControl='public, max-age=86400'}={}) {
  res.writeHead(status,{
    'content-type':contentType,
    'content-length':data.length,
    'cache-control':cacheControl,
    ...browserSecurityHeaders(),
  });
  res.end(data);
}

function journalContentType(file) {
  const ext=path.extname(file).toLowerCase();
  if(ext==='.html') return 'text/html; charset=utf-8';
  if(ext==='.json'||ext==='.jsonld') return 'application/json; charset=utf-8';
  if(ext==='.xml') return 'application/xml; charset=utf-8';
  if(ext==='.txt') return 'text/plain; charset=utf-8';
  if(ext==='.svg') return 'image/svg+xml';
  if(ext==='.png') return 'image/png';
  if(ext==='.jpg'||ext==='.jpeg') return 'image/jpeg';
  if(ext==='.webp') return 'image/webp';
  return 'application/octet-stream';
}

function resolveJournalAsset(journalDir, requestUrl) {
  const parsed=new URL(requestUrl,'http://fabric.local');
  let pathname=decodeURIComponent(parsed.pathname);
  if(!pathname.startsWith('/journal')) return null;
  let relative=pathname.slice('/journal'.length).replace(/^\/+/, '');
  if(!relative||relative.endsWith('/')) relative+=relative?'index.html':'index.html';
  const target=path.resolve(journalDir,relative);
  const prefix=journalDir.endsWith(path.sep)?journalDir:journalDir+path.sep;
  if(target!==journalDir&&!target.startsWith(prefix)) return null;
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return null;
  return target;
}

function resolveVisualAsset(visualDir, requestUrl) {
  const parsed=new URL(requestUrl,'http://fabric.local');
  let pathname=decodeURIComponent(parsed.pathname);
  if(!pathname.startsWith('/visuals')) return null;
  let relative=pathname.slice('/visuals'.length).replace(/^\/+/, '');
  if(!relative||relative.endsWith('/')) relative+=relative?'index.html':'index.html';
  const target=path.resolve(visualDir,relative);
  const prefix=visualDir.endsWith(path.sep)?visualDir:visualDir+path.sep;
  if(target!==visualDir&&!target.startsWith(prefix)) return null;
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return null;
  return target;
}

function resolveDemoAsset(demoDir, requestUrl) {
  const parsed=new URL(requestUrl,'http://fabric.local');
  let pathname=decodeURIComponent(parsed.pathname);
  if(!pathname.startsWith('/demos')) return null;
  let relative=pathname.slice('/demos'.length).replace(/^\/+/, '');
  if(!relative||relative.endsWith('/')) relative+=relative?'index.html':'index.html';
  const target=path.resolve(demoDir,relative);
  const prefix=demoDir.endsWith(path.sep)?demoDir:demoDir+path.sep;
  if(target!==demoDir&&!target.startsWith(prefix)) return null;
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return null;
  return target;
}

function buildVisualDeskMirror({moduleDir,outputDir,origin}) {
  const storiesDir=path.resolve(moduleDir,'../visual-desk/stories');
  const campaignsDir=path.resolve(moduleDir,'../graphics-command/campaigns');
  const landing=path.resolve(moduleDir,'../../public/visuals/index.html');
  fs.rmSync(outputDir,{recursive:true,force:true});
  fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  if(fs.existsSync(landing)) fs.copyFileSync(landing,path.join(outputDir,'index.html'));

  const files=fs.existsSync(storiesDir)
    ? fs.readdirSync(storiesDir).filter((name)=>name.endsWith('.json')).sort()
    : [];
  const entries=[];
  for(const name of files){
    const input=JSON.parse(fs.readFileSync(path.join(storiesDir,name),'utf8'));
    const built=buildVisualStory(input,{outputRoot:outputDir,origin});
    entries.push({
      slug:built.story.slug,
      title:built.story.title,
      canonicalUrl:built.manifest.canonicalUrl,
      socialCardUrl:built.manifest.socialCardUrl,
      motionStageUrl:built.manifest.assets.motionStage,
      evidenceState:built.story.evidenceState,
      storyDigest:built.story.digest,
      publishedAt:built.story.publishedAt,
      kind:'evidence_story',
    });
  }

  const campaignFiles=fs.existsSync(campaignsDir)
    ? fs.readdirSync(campaignsDir).filter((name)=>name.endsWith('.json')).sort()
    : [];
  for(const name of campaignFiles){
    const input=JSON.parse(fs.readFileSync(path.join(campaignsDir,name),'utf8'));
    if(input?.schema!=='evercraft.commercial-attention-campaign.v1') continue;
    const built=buildCommercialCampaign(input,{outputRoot:outputDir,origin});
    entries.push({
      slug:built.campaign.slug,
      title:built.campaign.product+' • '+built.campaign.offer,
      canonicalUrl:built.manifest.assets.site,
      socialCardUrl:built.manifest.assets.feed,
      motionStageUrl:built.manifest.assets.motion,
      evidenceState:built.campaign.truthState,
      storyDigest:built.campaign.digest,
      publishedAt:new Date().toISOString(),
      kind:'commercial_campaign',
      offerUrl:built.manifest.offerUrl,
    });
  }
  const index={
    schema:'evercraft.fabric.visual-desk-index.v1',
    origin:String(origin||'').replace(/\/$/,''),
    count:entries.length,
    stories:entries,
  };
  fs.writeFileSync(path.join(outputDir,'index.json'),JSON.stringify(index,null,2)+'\n',{mode:0o600});
  return {
    ready:fs.existsSync(path.join(outputDir,'index.html')),
    count:entries.length,
    origin:index.origin,
  };
}

function refreshVisualDeskMirror({outputDir,origin}) {
  const entries=[];
  if(fs.existsSync(outputDir)){
    for(const item of fs.readdirSync(outputDir,{withFileTypes:true})){
      if(!item.isDirectory()) continue;
      const manifestFile=path.join(outputDir,item.name,'manifest.json');
      if(!fs.existsSync(manifestFile)) continue;
      try{
        const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
        const isStory=['evercraft.visual-story.manifest.v2','evercraft.visual-story.manifest.v3'].includes(manifest?.schema);
        const isCampaign=manifest?.schema==='evercraft.commercial-visual.manifest.v1';
        if(!isStory&&!isCampaign) continue;
        entries.push(isCampaign ? {
          slug:manifest.slug,
          title:manifest.title,
          canonicalUrl:manifest.assets?.site||null,
          socialCardUrl:manifest.assets?.feed||null,
          motionStageUrl:manifest.assets?.motion||null,
          evidenceState:manifest.truthState||'synthetic_visualization',
          storyDigest:manifest.campaignDigest,
          publishedAt:manifest.publishedAt||null,
          kind:'commercial_campaign',
          offerUrl:manifest.offerUrl||null,
        } : {
          slug:manifest.slug,
          title:manifest.title,
          canonicalUrl:manifest.canonicalUrl,
          socialCardUrl:manifest.socialCardUrl,
          motionStageUrl:manifest.assets?.motionStage||null,
          evidenceState:manifest.evidenceState,
          storyDigest:manifest.storyDigest,
          publishedAt:manifest.publishedAt,
          kind:'evidence_story',
        });
      }catch{}
    }
  }
  entries.sort((a,b)=>
    String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))||
    String(a.slug||'').localeCompare(String(b.slug||''))
  );
  const index={
    schema:'evercraft.fabric.visual-desk-index.v1',
    origin:String(origin||'').replace(/\/$/,''),
    count:entries.length,
    stories:entries,
  };
  fs.writeFileSync(path.join(outputDir,'index.json'),JSON.stringify(index,null,2)+'\n',{mode:0o600});
  return {
    ready:fs.existsSync(path.join(outputDir,'index.html')),
    count:entries.length,
    origin:index.origin,
  };
}

function readSourceReleaseRef(file){
  const value=String(file||'').trim();
  if(!value) return null;
  try{
    const release=fs.readFileSync(value,'utf8').trim().toLowerCase();
    return /^[a-f0-9]{40,64}$/.test(release)?release:null;
  }catch{
    return null;
  }
}

function secureTokenMatches(expected,supplied) {
  const a=Buffer.from(String(expected||''),'utf8');
  const b=Buffer.from(String(supplied||''),'utf8');
  if(!a.length||a.length!==b.length) return false;
  return crypto.timingSafeEqual(a,b);
}

async function readJson(req,{maxBytes=1024*1024}={}) {
  const chunks=[];
  let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if (bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

async function readOfferInput(req,{maxBytes=8192}={}){
  const chunks=[];
  let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  const type=String(req.headers['content-type']||'').toLowerCase();
  if(!raw) return {};
  if(type.includes('application/json')) return JSON.parse(raw);
  if(type.includes('application/x-www-form-urlencoded')){
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  throw new Error('unsupported_offer_content_type');
}

export async function startFabricLocalRuntime({
  host='127.0.0.1',
  port=8787,
  catalog=null,
  challengeToken='',
  nodeReceiptPath='',
  allocatorTokenFile='',
  nodeAttestationProvider=null,
  faieStateDir='',
  faieCollectorConfig=null,
  faieSurfaceEnabled=true,
  visualStateDir='',
  visualOrigin='',
  visualIngestToken='',
  sabanCapacityHealthFile='',
  releaseRefFile='',
  purchaseIntentFetch=fetch,
  purchaseIntentUrl=process.env.EVERCRAFT_PURCHASE_INTENT_OWNED_URL||'',
  paymentOpsUrl=process.env.EVERCRAFT_PAYMENT_OPS_OWNED_URL||'',
  studioLeadsDir='',
}={}) {
  const instanceId='fabric_local_'+crypto.randomBytes(10).toString('hex');
  const resolvedReleaseRefFile=String(
    releaseRefFile||
    process.env.EVERCRAFT_FABRIC_RELEASE_REF_FILE||
    '/var/lib/evercraft/fabric-update/runtime-release-ref'
  ).trim();
  // Capture once at process boot. Health must describe the code that built the
  // resident mirrors, not whatever marker a later updater writes on disk.
  const sourceReleaseRef=readSourceReleaseRef(resolvedReleaseRefFile);
  let deploymentReceiptRef='';
  const studioAlertDispatcher=createStudioAlertDispatcher({folder:studioLeadsDir||undefined});
  const studioInquiry=createStudioInquiryHandler({storeDir:studioLeadsDir,
    onAlertQueued:()=>{if(studioAlertDispatcher.enabled)void studioAlertDispatcher.dispatch().catch(()=>{});}});
  const checkoutHandoffs=new Map();
  const createCheckoutHandoff=({slug,checkoutUrl,amountLabel,orderKey})=>{
    const now=Date.now();
    for(const [key,row] of checkoutHandoffs.entries()){
      if(!row||row.expiresAt<=now) checkoutHandoffs.delete(key);
    }
    const token=crypto.randomBytes(24).toString('base64url');
    checkoutHandoffs.set(token,{
      slug:String(slug||''),
      checkoutUrl:String(checkoutUrl||''),
      amountLabel:String(amountLabel||''),
      orderKey:String(orderKey||''),
      expiresAt:now+10*60*1000,
    });
    return token;
  };
  if (
    nodeAttestationProvider !== null &&
    typeof nodeAttestationProvider !== 'function'
  ) {
    throw new Error('node_attestation_provider_invalid');
  }
  if(typeof purchaseIntentFetch!=='function'){
    throw new Error('purchase_intent_fetch_invalid');
  }
  const commerceTransport=ownedPaymentTransportConfig({purchaseIntentUrl,paymentOpsUrl});
  const purchaseIntentEndpoint=commerceTransport.purchaseIntentEndpoint;
  const directPaymentOpsEndpoint=commerceTransport.paymentOpsEndpoint;
  // No Base44 fallback. Missing owned endpoints leave paid actions on hold.
  const checkoutLegacyDependency=false;
  const staticPrepared=Array.isArray(catalog)?nativeOnlyCatalog(catalog):null;
  const preparedCatalog=()=>staticPrepared||nativeOnlyCatalog(loadFabricCatalogFromRepository());
  const token=validateOpenAiChallengeToken(challengeToken);
  const challengePath='/.well-known/openai-apps-challenge';
  const edgeAttestationPath='/.well-known/evercraft-edge-attestation';
  const resolvedNodeReceipt=path.resolve(
    nodeReceiptPath||path.join(os.homedir(),'.local/state/evercraft/organism/compute/nodeseed-receipt.json')
  );
  const resolvedAllocatorToken=path.resolve(
    allocatorTokenFile||path.join(os.homedir(),'.local/state/evercraft/organism/.secrets/allocator-token')
  );
  const edgeAttestationReady=()=>Boolean(nodeAttestationProvider)||
    (fs.existsSync(resolvedNodeReceipt)&&fs.existsSync(resolvedAllocatorToken));
  const resolvedSabanCapacityHealthFile=path.resolve(
    sabanCapacityHealthFile||
    process.env.EVERCRAFT_SABAN_CAPACITY_HEALTH_FILE||
    '/var/lib/evercraft/fabric-secrets/saban-capacity-health.json'
  );
  const readSabanCapacityHealth=()=>{
    const unavailable={
      resident:false,
      state:'unavailable',
      zero_spend_only:null,
      public_market_discovery:null,
      receipt_stale:null,
      observed_at:null,
    };
    if(!fs.existsSync(resolvedSabanCapacityHealthFile)) return unavailable;
    try{
      const row=JSON.parse(fs.readFileSync(resolvedSabanCapacityHealthFile,'utf8'));
      if(row?.schema!=='evercraft.fabric-saban-capacity-health.v1'){
        return {...unavailable,state:'invalid_receipt',receipt_stale:true};
      }
      const observedAt=String(row.observed_at||'')||null;
      const observedMs=Date.parse(observedAt||'');
      const ageMs=Number.isFinite(observedMs)?Date.now()-observedMs:Number.POSITIVE_INFINITY;
      const stale=
        !Number.isFinite(observedMs)||
        ageMs>10*60*1000||
        ageMs<-60*1000;
      const zeroSpend=row.zero_spend_only===true;
      const publicDiscovery=row.public_market_discovery===true;
      const ownedHost=row.owned_host===true;
      const state=String(row.state||'unknown');
      return {
        resident:
          row.resident===true&&
          state==='ready'&&
          ownedHost&&
          zeroSpend&&
          !publicDiscovery&&
          !stale,
        state,
        zero_spend_only:zeroSpend,
        public_market_discovery:publicDiscovery,
        receipt_stale:stale,
        observed_at:observedAt,
      };
    }catch{
      return {...unavailable,state:'invalid_receipt',receipt_stale:true};
    }
  };

  async function nodeAttestation(nonce){
    const nonceValue=String(nonce||'').trim();
    if(!/^[A-Za-z0-9._:-]{16,256}$/.test(nonceValue)) throw new Error('edge_attestation_nonce_invalid');
    if(!edgeAttestationReady()) throw new Error('edge_attestation_not_configured');
    if(nodeAttestationProvider){
      const provided=await nodeAttestationProvider(nonceValue);
      const attestation=provided?.attestation||provided;
      if(!attestation||typeof attestation!=='object'){
        throw new Error('edge_attestation_provider_invalid');
      }
      return {
        schema:'evercraft.operator-public-edge.attestation.v1',
        trust_class:'operator_authorized_public_edge',
        attestation,
        allocator_authority_exposed:false,
        allocator_authority_persisted:false,
        physical_field_claim:false,
        observed_at:new Date().toISOString(),
      };
    }
    const receipt=JSON.parse(fs.readFileSync(resolvedNodeReceipt,'utf8'));
    const endpoint=new URL(String(receipt?.endpoint||''));
    if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(endpoint.hostname.toLowerCase())){
      throw new Error('nodeseed_attestation_endpoint_must_be_loopback');
    }
    const token=fs.readFileSync(resolvedAllocatorToken,'utf8').trim();
    if(!token) throw new Error('nodeseed_allocator_token_missing');
    const target=new URL('/v1/attest',endpoint);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(target,{
        method:'POST',
        headers:{authorization:'Bearer '+token,'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({nonce:nonceValue}),
        signal:controller.signal,
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.ok!==true||!body?.attestation) throw new Error('nodeseed_attestation_failed');
      return {
        schema:'evercraft.operator-public-edge.attestation.v1',
        trust_class:'operator_authorized_public_edge',
        attestation:body.attestation,
        allocator_authority_exposed:false,
        allocator_authority_persisted:false,
        physical_field_claim:false,
        observed_at:new Date().toISOString(),
      };
    }finally{clearTimeout(timer);}
  }
  const moduleDir=path.dirname(fileURLToPath(import.meta.url));
  const pluginDir=path.resolve(moduleDir,'../../plugins/evercraft-fabric');
  const journalDir=path.resolve(moduleDir,'../../public/journal');
  const romanCampaignFile=path.resolve(moduleDir,'../../public/campaigns/roman/index.html');
  const romanPointerFile=path.resolve(moduleDir,'../../public/campaigns/roman/continuity.json');
  const romanCampaignPresent=()=>fs.existsSync(romanCampaignFile);
  const demoDir=path.resolve(moduleDir,'../../public/demos');
  // Emergency service frontages use first-party source, never a hosted app.
  // These are public presentation routes, not a booking backend or DNS cutover.
  const ownedServicePages=new Map([
    ['/eps','public/eps/index.html'],
    ['/havenly','public/havenly/index.html'],
    ['/sunshine-spotless','public/sunshine-spotless/index.html'],
    ['/apps/eps-estimator','public/apps/eps-estimator/index.html'],
  ]);
  const ownedServiceHostRoutes=new Map([
    ['evercraftpropertyservices.com','/eps/'],
    ['www.evercraftpropertyservices.com','/eps/'],
    ['havenlycleaning.com','/havenly/'],
    ['www.havenlycleaning.com','/havenly/'],
    ['sunshineandspotless.com','/sunshine-spotless/'],
    ['www.sunshineandspotless.com','/sunshine-spotless/'],
  ]);
  const ownedPublicRoot=path.resolve(moduleDir,'../../');
  const resolveOwnedServicePage=(pathname)=>{
    const key=String(pathname||'').replace(/\/+$/,'');
    const relative=ownedServicePages.get(key);
    if(!relative)return null;
    const target=path.resolve(ownedPublicRoot,relative);
    if(!target.startsWith(ownedPublicRoot+path.sep))return null;
    return fs.existsSync(target)&&fs.statSync(target).isFile()?target:null;
  };
  const visualStateEphemeral=!String(visualStateDir||'').trim();
  const visualDir=path.resolve(
    visualStateDir||path.join(os.tmpdir(),'evercraft-visual-desk-'+instanceId)
  );
  const resolvedVisualOrigin=String(
    visualOrigin||process.env.EVERCRAFT_VISUAL_ORIGIN||'https://fabric.systemiacommandcenters.com/visuals'
  ).replace(/\/$/,'');
  let visualMirror=buildVisualDeskMirror({
    moduleDir,
    outputDir:visualDir,
    origin:resolvedVisualOrigin,
  });
  const resolvedVisualIngestToken=String(visualIngestToken||'').trim();
  if(resolvedVisualIngestToken && resolvedVisualIngestToken.length<32){
    throw new Error('visual_ingest_token_too_short');
  }
  const visualIngestReady=()=>resolvedVisualIngestToken.length>=32;

  const faieSurface=faieSurfaceEnabled
    ? createFabricFaieSurface({
        stateDir:faieStateDir||undefined,
        collectorConfig:faieCollectorConfig||undefined,
      })
    : null;
  const docs={
    privacy:fs.readFileSync(path.join(pluginDir,'PRIVACY.md'),'utf8'),
    terms:fs.readFileSync(path.join(pluginDir,'TERMS.md'),'utf8'),
    support:fs.readFileSync(path.join(pluginDir,'SUPPORT.md'),'utf8'),
  };
  const brandIcon=fs.readFileSync(path.join(pluginDir,'assets','evercraft-icon.png'));

  const health=()=>{
    const prepared=preparedCatalog();
    const sabanCapacity=readSabanCapacityHealth();
    return ({
    ok:true,
    service:'evercraft-fabric-local',
    server:'evercraft-fabric',
    version:'1.1.0',
    runtime:nodeAttestationProvider?'Evercraft Compute':'Evercraft Fabric local',
    instance_id:instanceId,
    source_release_ref:sourceReleaseRef,
    source_release_ref_bound:Boolean(sourceReleaseRef),
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    transport:'Streamable HTTP',
    transport_modes:['application/json','text/event-stream'],
    mcp_path:'/mcp',
    tools:fabricDirectoryTools().map((tool)=>tool.name),
    capability_count:preparedCatalog().capabilities.length,
    read_only:true,
    transactional:false,
    external_action_authority:false,
    mcp_read_only:true,
    human_offer_checkout_enabled:commerceTransport.fully_configured,
    human_offer_checkout_path_template:'/api/offers/{slug}/checkout',
    human_offer_checkout_requires_explicit_confirmation:true,
    human_offer_checkout_handoff_mode:'explicit_evercraft_page',
    payment_authority:'Evercraft Payments',
    payment_router:'Raven Nexus',
    // This legacy field covers read-only MCP connections only, not payment.
    base44_transport_enabled:false,
    checkout_transport_contract:'Evercraft Payments / Raven Nexus',
    checkout_purchase_intent_legacy_dependency:false,
    checkout_direct_offer_legacy_dependency:false,
    checkout_legacy_dependency:false,
    checkout_purchase_intent_configured:commerceTransport.purchase_intent_configured,
    checkout_direct_offer_ops_configured:commerceTransport.direct_offer_ops_configured,
    checkout_operational_state:commerceTransport.fully_configured
      ? 'owned_transport_requires_independent_checkout_canary'
      : 'held_owned_payment_endpoint_unconfigured',
    checkout_provider_paid_verified:false,
    checkout_fulfillment_verified:false,
    removed_legacy_base44_connections:prepared.removed_legacy_base44_connections,
    removed_legacy_base44_mcp_connections:prepared.removed_legacy_base44_mcp_connections,
    secure_tunnel_compatible:true,
    public_https_runtime_capable:true,
    edge_attestation_supported:edgeAttestationReady(),
    edge_attestation_path:edgeAttestationReady()?edgeAttestationPath:null,
    edge_attestation_allocator_authority_exposed:false,
    edge_attestation_source:nodeAttestationProvider
      ? 'in_process_nodeseed_identity'
      : edgeAttestationReady()
        ? 'loopback_nodeseed'
        : null,
    saban_resource_field_resident:sabanCapacity.resident,
    saban_resource_field_state:sabanCapacity.state,
    saban_resource_field_zero_spend_only:sabanCapacity.zero_spend_only,
    saban_resource_field_public_market_discovery:sabanCapacity.public_market_discovery,
    saban_resource_field_receipt_stale:sabanCapacity.receipt_stale,
    saban_resource_field_observed_at:sabanCapacity.observed_at,
    saban_resource_field_health_source:'owned_update_receipt',
    public_plugin_submission_ready:true,
    mobile_path:'/mobile',
    mobile_installable:true,
    aliev_public_path:'/aliev',
    earthworks_simulator_path:'/earthworks',
    earthworks_simulator_authority:'interactive_software_simulation_only',
    chum_human_review_path_template:'/api/chum/go/{public_id}',
    chum_human_review_authority:'discovery_review_only',
    roman_emergency_mirror_path:'/campaigns/roman/',
    roman_owned_funnel_path:'/go/roman',
    roman_owned_continuity_pointer_path:'/go/roman/links.json',
    roman_owned_funnel_mode:'local_first_verified_backup_if_local_unavailable',
    roman_owned_funnel_dns_interception:false,
    roman_emergency_mirror_ready:romanCampaignPresent(),
    roman_emergency_mirror_owner_review_required:true,
    roman_domain_dns_cutover_verified:false,
    journal_mirror_path:'/journal/',
    journal_mirror_ready:fs.existsSync(path.join(journalDir,'index.html')),
    journal_mirror_indexing:'index_follow_canonical_public_origin',
    demo_surface_path:'/demos/',
    demo_surface_ready:fs.existsSync(path.join(demoDir,'hvac-lead-recovery','index.html')),
    demo_surface_authority:'public_static_proof_only',
    owned_service_frontage_routes:['/eps/','/havenly/','/sunshine-spotless/','/apps/eps-estimator/'],
    owned_service_frontages_source_ready:[...ownedServicePages.values()].every(p=>fs.existsSync(path.resolve(ownedPublicRoot,p))),
    owned_service_frontages_backend_intake_verified:false,
    owned_service_frontages_dns_cutover_verified:false,
    owned_service_custom_host_routing_source_ready:true,
    owned_service_custom_domain_tls_verified:false,
    visual_desk_path:'/visuals/',
    visual_desk_ready:visualMirror.ready,
    visual_desk_story_count:visualMirror.count,
    visual_desk_origin:visualMirror.origin,
    visual_desk_motion_capable:visualMirror.count>0,
    visual_desk_ingest_path:'/api/visuals/ingest',
    visual_desk_ingest_ready:visualIngestReady(),
    visual_desk_ingest_authority:'authenticated_materialization_only',
    visual_desk_ingest_publication_authority:false,
    faie_native_surface:Boolean(faieSurface),
    faie_public_path:faieSurface?'/faie/':null,
    faie_public_api:faieSurface?'/api/faie':null,
    faie_mcp_path:faieSurface?'/mcp/faie':null,
    faie_base44_transport_enabled:false,
    provider_publication_state:'external_to_runtime',
    public_submission_note:'The owned Fabric runtime and review surface are submission-ready. Provider review, approval, publication, and directory visibility are external states and are not inferred by this health endpoint.',
    catalog_reload_mode:staticPrepared?'static_injected':'hot_reload_repository',
  });
  };

  const server=http.createServer(async(req,res)=>{
    try {
      // Exact custom domains are standalone public frontages, not aliases
      // for Fabric's discovery/commerce/internal routes.
      const publicHost=String(req.headers.host||'').trim().toLowerCase().replace(/:\d+$/,'');
      const publicServiceHome=ownedServiceHostRoutes.get(publicHost);
      if(publicServiceHome){
        const reqPath=new URL(String(req.url||'/'),'http://fabric.local').pathname;
        const isHome=(reqPath==='/'||reqPath==='/index.html');
        const isEpsEstimator=publicServiceHome==='/eps/'&&
          (reqPath==='/apps/eps-estimator'||reqPath==='/apps/eps-estimator/');
        if((req.method!=='GET'&&req.method!=='HEAD')||(!isHome&&!isEpsEstimator)){
          return sendJson(res,404,{ok:false,error:'service_public_path_not_found'});
        }
        const asset=resolveOwnedServicePage(isEpsEstimator?'/apps/eps-estimator/':publicServiceHome);
        if(!asset)return sendJson(res,503,{ok:false,error:'owned_service_frontage_unavailable'});
        const payload=fs.readFileSync(asset);
        res.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'content-length':payload.length,
          'cache-control':'public, max-age=60, must-revalidate',
          'x-content-type-options':'nosniff',
          // Keep unlaunched domains out of search until DNS, TLS and operator
          // release evidence exists. This is NOT a verified SEO cutover.
          'x-robots-tag':'noindex, nofollow',
          'referrer-policy':'no-referrer',
          'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
        });
        if(req.method==='HEAD')return res.end();
        return res.end(payload);
      }

      // Only this bounded route accepts untrusted commercial inquiry data.
      // It never invokes agents or checkout, sends email, or exposes stored leads.
      if(new URL(String(req.url||'/'),'http://fabric.local').pathname==='/api/commercial-studio/inquiry'){
        return await studioInquiry(req,res);
      }

      if (req.method==='OPTIONS') {
        res.writeHead(204,{
          'access-control-allow-origin':'*',
          'access-control-allow-headers':'content-type, accept, mcp-protocol-version, mcp-session-id',
          'access-control-expose-headers':'mcp-protocol-version, mcp-session-id',
          'access-control-allow-methods':'GET, POST, OPTIONS',
        });
        return res.end();
      }

      if (faieSurface && await faieSurface.handle(req,res)) {
        return;
      }

      if (req.method==='GET' && req.url==='/health') {
        return sendJson(res,200,health());
      }

      // Developer recovery surface on the existing owned Fabric runtime.
      // Read-only, no forwarding to provider-hosted MCPs returning HTTP 402.
      if(req.method==='GET'){
        const developerUrl=new URL(String(req.url||'/'),'http://fabric.local');
        const pathname=developerUrl.pathname;
        if(pathname==='/developers.json'){
          return sendJson(res,200,ownedDeveloperStatus(preparedCatalog().capabilities,{
            deploymentReceiptBound:health().deployment_receipt_bound===true,
          }));
        }
        if(pathname==='/developers'||pathname==='/developers/'){
          const capabilities=preparedCatalog().capabilities;
          const intent=String(developerUrl.searchParams.get('intent')||'').trim().slice(0,200);
          const matches=intent.length>=3
            ? matchFabricCapabilities(intent,capabilities,{limit:6})
            : [];
          return sendText(res,200,renderOwnedDeveloperPage({
            capabilities,matches,intent,
            deploymentReceiptBound:health().deployment_receipt_bound===true,
          }),{contentType:'text/html; charset=utf-8'});
        }
      }

      // Public machine-readable rescue addresses. No original-domain routing change.
      // Other Evercraft-controlled sites can consume these reviewed static endpoints.
      if(new URL(String(req.url||'/'),'http://fabric.local').pathname==='/go/roman/links.json'){
        if(req.method!=='GET'&&req.method!=='HEAD'){
          return sendJson(res,405,{error:'method_not_allowed'},{allow:'GET, HEAD'});
        }
        try{
          const bytes=fs.readFileSync(romanPointerFile);
          const p=JSON.parse(bytes.toString('utf8'));
          if(p.subject!=='voteroman.com'||
             p.original_domain_auto_redirect_active!==false||
             p.primary_evercraft_entry!=='https://fabric.systemiacommandcenters.com/go/roman'||
             p.existing_donation_website!=='https://donate.voteroman.com/'){
            return sendJson(res,503,{error:'continuity_pointer_integrity_failed'});
          }
          res.writeHead(200,{
            'content-type':'application/json; charset=utf-8',
            'content-length':bytes.length,
            'cache-control':'no-store',
            'access-control-allow-origin':'*',
            'x-content-type-options':'nosniff',
            'x-robots-tag':'noindex, nofollow',
          });
          return res.end(req.method==='HEAD'?undefined:bytes);
        }catch{
          return sendJson(res,503,{error:'continuity_pointer_unavailable'});
        }
      }

      // Public informational continuation route on the Evercraft-controlled origin.
      // Does NOT receive visits to voteroman.com until lawful DNS/hosting routing changes.
      // No visitor attribution, URL query forwarding, outbound messages or cookies.
      if (['/go/roman','/go/roman/'].includes(
        new URL(String(req.url||'/'),'http://fabric.local').pathname
      )) {
        if(req.method!=='GET'&&req.method!=='HEAD'){
          return sendJson(res,405,{error:'method_not_allowed'},{allow:'GET, HEAD'});
        }
        let html='';
        try { if(romanCampaignPresent())html=fs.readFileSync(romanCampaignFile,'utf8'); }
        catch { /* local copy may be unavailable; independently verify backup */ }
        const decision=await resolveRomanContinuity({localHtml:html});
        if(decision.status===302){
          res.writeHead(302,{
            location:decision.location,
            'cache-control':'no-store',
            'x-content-type-options':'nosniff',
            'x-robots-tag':'noindex, nofollow',
            'referrer-policy':'no-referrer',
            'x-evercraft-continuity-route':decision.state,
          });
          return res.end();
        }
        return sendJson(res,503,{
          state:'independent_campaign_information_unavailable',
          original_domain_routing_not_modified:true,
        });
      }

      // Independent, read-only campaign mirror. This route is *not* an apex-domain cutover.
      // It cannot modify donation DNS, expose visitor data, or proxy the Base44 outage.
      if ((req.method==='GET'||req.method==='HEAD') &&
          ['/campaigns/roman','/campaigns/roman/'].includes(
            new URL(String(req.url||'/'),'http://fabric.local').pathname
          )) {
        if (!romanCampaignPresent()) {
          return sendJson(res,503,{error:'campaign_mirror_source_unavailable'});
        }
        const content=fs.readFileSync(romanCampaignFile,'utf8');
        if (!content.includes('Roman Kilinkaridis') ||
            !content.includes('https://donate.voteroman.com/') ||
            !content.includes('</html>')) {
          return sendJson(res,503,{error:'campaign_mirror_integrity_failed'});
        }
        const body=Buffer.from(content,'utf8');
        res.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'content-length':body.length,
          'cache-control':'public, max-age=60, must-revalidate',
          ...browserSecurityHeaders(),
          'x-robots-tag':'noindex, nofollow',
          'x-evercraft-campaign-source':'owned-fabric-static',
        });
        return res.end(req.method==='HEAD'?undefined:body);
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/checkout/handoff/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const tokenValue=decodeURIComponent(parsed.pathname.slice('/checkout/handoff/'.length)).replace(/\/+$/,'');
        const handoff=checkoutHandoffs.get(tokenValue)||null;
        if(!handoff||handoff.expiresAt<=Date.now()){
          checkoutHandoffs.delete(tokenValue);
          return sendText(
            res,
            410,
            renderPaymentHoldPage({slug:'',orderKey:''}),
            {contentType:'text/html; charset=utf-8'}
          );
        }
        return sendText(
          res,
          200,
          renderPaymentHandoffPage({
            slug:handoff.slug,
            checkoutUrl:handoff.checkoutUrl,
            amountLabel:handoff.amountLabel,
            orderKey:handoff.orderKey,
          }),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && (req.url==='/aliev'||req.url==='/aliev/')) {
        return sendText(
          res,
          200,
          renderAliEvLanding(),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && req.url==='/earthworks/controller.mjs') {
        return sendBuffer(
          res,
          200,
          fs.readFileSync(path.resolve(moduleDir,'../earthworks-autonomy/fleet-controller.mjs')),
          {contentType:'application/javascript; charset=utf-8',cacheControl:'no-store'}
        );
      }

      if (req.method==='GET' && req.url==='/earthworks/app.mjs') {
        return sendBuffer(
          res,
          200,
          fs.readFileSync(path.resolve(moduleDir,'./earthworks-simulator-app.mjs')),
          {contentType:'application/javascript; charset=utf-8',cacheControl:'no-store'}
        );
      }

      if (req.method==='GET' && (req.url==='/earthworks'||req.url==='/earthworks/')) {
        return sendInteractiveHtml(
          res,
          200,
          renderEarthWorksSimulator()
        );
      }

      if (req.method==='POST' && req.url==='/api/visuals/ingest') {
        if(!visualIngestReady()){
          return sendJson(res,503,{
            ok:false,
            error:'visual_ingest_not_configured',
            publicationAuthority:false,
          });
        }
        const authorization=String(req.headers.authorization||'');
        const supplied=authorization.startsWith('Bearer ')?authorization.slice(7).trim():'';
        if(!secureTokenMatches(resolvedVisualIngestToken,supplied)){
          return sendJson(res,401,{
            ok:false,
            error:'visual_ingest_unauthorized',
            publicationAuthority:false,
          });
        }

        const body=await readJson(req,{maxBytes:512*1024});
        if(body?.schema!=='evercraft.visual-desk.transport-envelope.v1'){
          return sendJson(res,400,{ok:false,error:'visual_transport_envelope_schema_invalid',publicationAuthority:false});
        }
        if(body.publicationAuthority!==false){
          return sendJson(res,400,{ok:false,error:'visual_transport_publication_authority_invalid',publicationAuthority:false});
        }

        let normalized;
        try{
          normalized=normalizeVisualStory(body.story);
        }catch(error){
          return sendJson(res,400,{
            ok:false,
            error:error instanceof Error?error.message:String(error),
            publicationAuthority:false,
          });
        }
        if(String(body.story_sha256||'')!==normalized.digest){
          return sendJson(res,409,{
            ok:false,
            error:'visual_transport_story_digest_mismatch',
            expected_story_sha256:normalized.digest,
            publicationAuthority:false,
          });
        }

        const existingFile=path.join(visualDir,normalized.slug,'story.json');
        if(fs.existsSync(existingFile)){
          try{
            const existing=normalizeVisualStory(JSON.parse(fs.readFileSync(existingFile,'utf8')));
            if(existing.digest===normalized.digest){
              visualMirror=refreshVisualDeskMirror({outputDir:visualDir,origin:resolvedVisualOrigin});
              return sendJson(res,200,{
                ok:true,
                schema:'evercraft.visual-desk.ingest-receipt.v1',
                receipt_id:'visual-ingest:'+normalized.digest.slice(0,24),
                status:'deduped',
                slug:normalized.slug,
                story_sha256:normalized.digest,
                canonical_url:resolvedVisualOrigin+'/'+normalized.slug+'/',
                publicationAuthority:false,
                external_social_publish_performed:false,
              });
            }
          }catch{}
          return sendJson(res,409,{
            ok:false,
            error:'visual_story_slug_digest_conflict',
            slug:normalized.slug,
            publicationAuthority:false,
          });
        }

        const built=buildVisualStory(body.story,{
          outputRoot:visualDir,
          origin:resolvedVisualOrigin,
        });
        visualMirror=refreshVisualDeskMirror({outputDir:visualDir,origin:resolvedVisualOrigin});
        return sendJson(res,201,{
          ok:true,
          schema:'evercraft.visual-desk.ingest-receipt.v1',
          receipt_id:'visual-ingest:'+built.story.digest.slice(0,24),
          status:'materialized',
          slug:built.story.slug,
          story_sha256:built.story.digest,
          canonical_url:built.manifest.canonicalUrl,
          source:String(body.source||'').slice(0,120)||null,
          source_edition_id:String(body.source_edition_id||'').slice(0,200)||null,
          candidate_id:String(body.candidate_id||'').slice(0,200)||null,
          publicationAuthority:false,
          external_social_publish_performed:false,
        });
      }

      if (req.method==='GET' && req.url==='/') {
        return sendText(
          res,
          200,
          renderFabricHome({capabilities:preparedCatalog().capabilities}),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && (req.url==='/offers'||req.url==='/offers/')) {
        return sendText(
          res,
          200,
          renderOffers(preparedCatalog().capabilities),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='POST' && String(req.url||'').startsWith('/api/offers/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const match=parsed.pathname.match(/^\/api\/offers\/([a-z0-9-]+)\/checkout$/i);
        if(!match) return sendJson(res,404,{ok:false,error:'offer_checkout_route_not_found'});

        const slug=decodeURIComponent(match[1]).toLowerCase();
        const directOffer=publicPaymentOffer(slug);
        const capabilityKey=offerPurchaseKeyForSlug(slug);
        if(!capabilityKey) return sendJson(res,404,{ok:false,error:'offer_not_found'});

        const body=await readOfferInput(req,{maxBytes:8192});
        const isForm=String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded');
        const confirmed=body?.user_confirmed===true||String(body?.user_confirmed||'').toLowerCase()==='true';
        if(!confirmed){
          return sendJson(res,409,{
            ok:false,
            error:'explicit_user_confirmation_required',
            authority:'Evercraft Payments',
            fulfillment_release:false,
          });
        }

        const suppliedIdempotency=String(body?.idempotency_key||'').trim();
        const idempotencyKey=/^[A-Za-z0-9._:-]{8,120}$/.test(suppliedIdempotency)
          ? suppliedIdempotency
          : 'fabric-'+slug+'-'+crypto.randomUUID();
        const customerRef=String(body?.customer_ref||'').trim().toLowerCase().slice(0,200);
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerRef)){
          return sendJson(res,422,{
            ok:false,
            error:'valid_customer_email_required',
            message:'Enter a valid email address for your receipt and order delivery.',
            authority:'Evercraft Payments',
            checkout_ready:false,
            fulfillment_release:false,
          });
        }

        const websiteUrl=slug==='website-audit'?String(body?.website_url||'').trim().slice(0,1001):null;
        if(slug==='website-audit'&&!websiteUrl){
          return sendJson(res,422,{ok:false,error:'public_https_website_required',checkout_ready:false,fulfillment_release:false});
        }
        let auditedDomain=null;
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),15000);
        let upstream;
        // A working public offer page never authorizes a provider fallback.
        if(!purchaseIntentEndpoint||!directPaymentOpsEndpoint){
          if(isForm) return sendText(res,503,renderPaymentHoldPage({slug,noAttempt:true}),{contentType:'text/html; charset=utf-8'});
          return sendJson(res,503,{ok:false,error:'owned_evercraft_payments_unavailable',authority:'Evercraft Payments',checkout_ready:false,fulfillment_release:false});
        }
        try{
          if(slug==='website-audit'){
            // Confirm the downstream runtime can retain the target before purchase.
            // This request cannot create a checkout or authorize fulfillment.
            const preflight=await purchaseIntentFetch(purchaseIntentEndpoint,{
              method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
              body:JSON.stringify({action:'website_audit_prepayment_preflight',capability_key:capabilityKey,website_url:websiteUrl}),
              signal:controller.signal,
            });
            const ready=await preflight.json().catch(()=>null);
            if(!preflight.ok||ready?.ok!==true||ready?.schema!=='raven.website-audit-context-preflight.v1'||ready?.checkout_created!==false||!ready?.audited_domain){
              if(isForm) return sendText(res,503,renderPaymentHoldPage({slug}),{contentType:'text/html; charset=utf-8'});
              return sendJson(res,503,{ok:false,error:'website_audit_context_preflight_failed',checkout_ready:false,fulfillment_release:false});
            }
            auditedDomain=ready.audited_domain;
          }
          upstream=await purchaseIntentFetch(directOffer?directPaymentOpsEndpoint:purchaseIntentEndpoint,{
            method:'POST',
            headers:{
              'content-type':'application/json',
              'accept':'application/json',
              'user-agent':'Evercraft-Fabric-Offer-Checkout/1.0',
            },
            body:JSON.stringify(directOffer?{
              action:'create_checkout',offer_key:directOffer.offer_key,
              order_key:buyerOrderKey(slug,idempotencyKey),customer_email:customerRef,
              source_ref:'fabric-native-offer|'+slug,return_origin:'https://fabric.systemiacommandcenters.com',
              success_path:'/offers/'+slug+'?payment=processing',cancel_path:'/offers/'+slug+'?payment=cancelled',
            }:{
              user_confirmed:true,
              capability_key:capabilityKey,
              idempotency_key:idempotencyKey,
              customer_ref:customerRef,
              ...(websiteUrl?{website_url:websiteUrl}:{}),
            }),
            signal:controller.signal,
          });
        }catch{
          // Network, TLS and timeout failures never silently initiate a retry
          // or claim an order was persisted. Offer owner-assisted recovery.
          if(isForm)return sendText(res,503,renderPaymentHoldPage({slug}),{contentType:'text/html; charset=utf-8'});
          return sendJson(res,503,{ok:false,error:'owned_evercraft_payments_unreachable',authority:'Evercraft Payments',checkout_ready:false,fulfillment_release:false});
        }finally{
          clearTimeout(timer);
        }

        const result=await upstream.json().catch(()=>null);
        if(directOffer&&result){
          result.checkout_ready=upstream.ok&&result.ok===true&&Number(result.amount_cents)===directOffer.amount_cents&&String(result.currency||'').toLowerCase()===directOffer.currency;
          result.payment_state='unpaid';
        }
        if(!upstream.ok||result?.ok!==true){
          if(isForm){
            return sendText(
              res,
              503,
              renderPaymentHoldPage({slug,orderKey:result?.order_key||''}),
              {contentType:'text/html; charset=utf-8'}
            );
          }
          return sendJson(res,upstream.status>=400&&upstream.status<600?upstream.status:502,{
            ok:false,
            error:String(result?.error||'evercraft_payments_checkout_unavailable'),
            authority:'Evercraft Payments',
            checkout_ready:false,
            fulfillment_release:false,
          });
        }

        let checkoutUrl=null;
        try{
          const candidate=new URL(String(result?.checkout_url||''));
          if(candidate.protocol==='https:') checkoutUrl=candidate.toString();
        }catch{}
        if(result?.checkout_ready!==true||!checkoutUrl||(auditedDomain&&(result?.context_persisted!==true||result?.audited_domain!==auditedDomain))){
          if(isForm){
            return sendText(
              res,
              503,
              renderPaymentHoldPage({slug,orderKey:result?.order_key||''}),
              {contentType:'text/html; charset=utf-8'}
            );
          }
          return sendJson(res,503,{
            ok:false,
            error:'evercraft_payments_checkout_not_ready',
            authority:'Evercraft Payments',
            order_key:result?.order_key||null,
            gate_key:result?.gate_key||null,
            checkout_ready:false,
            fulfillment_release:false,
          });
        }

        if(isForm){
          const cents=Number(result?.amount_cents);
          const amountLabel=Number.isFinite(cents)
            ? String.fromCharCode(36)+(cents/100).toFixed(2).replace(/\.00$/,'')
            : '';
          const handoffToken=createCheckoutHandoff({
            slug,
            checkoutUrl,
            amountLabel,
            orderKey:result?.order_key||'',
          });
          res.writeHead(303,{
            location:'/checkout/handoff/'+encodeURIComponent(handoffToken),
            'cache-control':'no-store',
            'x-content-type-options':'nosniff',
            'referrer-policy':'no-referrer',
            'x-evercraft-payment-authority':'Evercraft Payments',
          });
          return res.end();
        }

        return sendJson(res,200,{
          ok:true,
          authority:'Evercraft Payments',
          order_key:result.order_key,
          capability_key:capabilityKey,
          amount_cents:result.amount_cents,
          currency:result.currency,
          checkout_ready:true,
          checkout_url:checkoutUrl,
          payment_state:result.payment_state||'unpaid',
          fulfillment_release:false,
          rule:'Checkout creation is not payment. Fulfillment remains locked until authoritative provider verification.',
        });
      }

      const discoveryFiles={
        '/llms.txt':['../../public/llms.txt','text/plain; charset=utf-8'],
        '/llms-full.txt':['../../public/llms-full.txt','text/plain; charset=utf-8'],
        '/.well-known/evercraft-chum.json':['../../public/.well-known/evercraft-chum.json','application/json; charset=utf-8'],
        '/.well-known/evercraft-commercial-readiness.json':['../../public/.well-known/evercraft-commercial-readiness.json','application/json; charset=utf-8'],
      };
      if(req.method==='GET'&&Object.hasOwn(discoveryFiles,req.url)){
        const [relative,contentType]=discoveryFiles[req.url];
        return sendText(res,200,fs.readFileSync(path.resolve(moduleDir,relative),'utf8'),{contentType});
      }
      if(req.method==='GET'&&req.url==='/robots.txt')return sendText(res,200,'User-agent: *\nAllow: /\nSitemap: https://fabric.systemiacommandcenters.com/sitemap.xml\n',{contentType:'text/plain; charset=utf-8'});
      if(req.method==='GET'&&req.url==='/sitemap.xml'){
        const urls=['https://fabric.systemiacommandcenters.com/','https://fabric.systemiacommandcenters.com/offers',...listHumanOffers(preparedCatalog().capabilities).map(x=>x.url)];
        return sendText(res,200,'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>',{contentType:'application/xml; charset=utf-8'});
      }

      if(req.method==='GET'&&req.url==='/offers.json'){
        return sendJson(res,200,{schema:'evercraft.public-human-offers.v1',authority:'Evercraft Payments',offers:listHumanOffers(preparedCatalog().capabilities),checkout_created:false,payment_verified:false});
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/offers/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const slug=decodeURIComponent(parsed.pathname.slice('/offers/'.length)).replace(/\/+$/,'');
        if(slug&&!slug.includes('/')){
          const offer=offerCapabilityForSlug(slug,preparedCatalog().capabilities);
          if(!offer) return sendJson(res,404,{error:'offer_not_found'});
          if(parsed.searchParams.get('payment')==='processing'){
            const result=await verifyNativePaymentReturn(slug,parsed.searchParams,purchaseIntentFetch,directPaymentOpsEndpoint);
            const message=result.state==='paid'?'Payment verified. '+(result.queued?'Your work is queued.':'Delivery status is awaiting confirmation.'):
              result.state==='synthetic'?'QA payment verified. No fulfillment was released.':
              result.state==='invalid'?'Checkout return cannot be verified. Do not pay twice. Contact Evercraft using your checkout email.':
              'Payment verification pending. Do not pay again. Refresh this page later or contact Evercraft.';
            return sendText(res,result.status,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Evercraft Payments</title></head><body style="background:#0b1120;color:#ecf1fa;font:18px/1.6 system-ui;padding:32px;max-width:720px;margin:auto"><h1>Evercraft Payments</h1><p>'+message+'</p><a style="color:#9debdc" href="/support">Contact support</a></body></html>',{contentType:'text/html; charset=utf-8'});
          }
          const page=renderOfferPage(offer,{checkoutConfigured:commerceTransport.fully_configured});
          if(!page) return sendJson(res,404,{error:'offer_not_found'});
          return sendText(res,200,page,{contentType:'text/html; charset=utf-8'});
        }
      }

      if (req.method==='GET' && (req.url==='/mobile'||req.url==='/mobile/')) {
        return sendMobileHtml(
          res,
          200,
          renderFabricMobileApp({
            capabilityCount:preparedCatalog().capabilities.length,
          })
        );
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/mobile?')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const query=String(parsed.searchParams.get('q')||'').trim().slice(0,4000);
        let matches=[];
        let error='';
        if(query.length>=3){
          const rpc=await executeFabricDirectoryRpc({
            jsonrpc:'2.0',
            id:'mobile-match',
            method:'tools/call',
            params:{
              name:'match_evercraft_capability',
              arguments:{intent:query,limit:5},
            },
          },preparedCatalog().capabilities);
          if(rpc?.error){
            error=String(rpc.error.message||'Fabric could not match that request.');
          }else{
            matches=rpc?.result?.structuredContent?.matches||[];
          }
        }else if(query){
          error='Describe the problem in at least three characters.';
        }
        return sendMobileHtml(
          res,
          200,
          renderFabricMobileApp({
            query,
            matches,
            capabilityCount:preparedCatalog().capabilities.length,
            error,
          })
        );
      }

      if (req.method==='GET' && req.url==='/mobile/manifest.webmanifest') {
        return sendText(
          res,
          200,
          JSON.stringify(fabricMobileManifest()),
          {contentType:'application/manifest+json; charset=utf-8'}
        );
      }

      if (req.method==='GET' && req.url==='/capabilities') {
        return sendText(
          res,
          200,
          renderCapabilities(preparedCatalog().capabilities),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/api/chum/go/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const raw=decodeURIComponent(parsed.pathname.slice('/api/chum/go/'.length));
        if(!raw || raw.includes('/') || !/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(raw)){
          return sendJson(res,400,{
            error:'invalid_capability_id',
            transactional:false,
            external_action_taken:false,
          });
        }
        const capability=preparedCatalog().capabilities.find((item)=>item.public_id===raw);
        if(!capability) return sendJson(res,404,{
          error:'capability_not_found',
          transactional:false,
          external_action_taken:false,
        });
        const surface=String(parsed.searchParams.get('surface')||'chum_public_surface').slice(0,80);
        const offerSlug=offerSlugForCapability(raw);
        const location=offerSlug
          ? '/offers/'+encodeURIComponent(offerSlug)+'?from=chum&surface='+encodeURIComponent(surface)
          : '/capabilities/'+encodeURIComponent(raw)+'?from=chum&surface='+encodeURIComponent(surface);
        res.writeHead(302,{
          location,
          'cache-control':'no-store',
          'x-content-type-options':'nosniff',
          'referrer-policy':'no-referrer',
          'x-evercraft-authority':'discovery-review-only',
        });
        return res.end();
      }

      if (req.method==='GET' && req.url==='/capabilities.json') {
        const prepared=preparedCatalog();
        return sendJson(res,200,{
          ok:true,
          directory:'Evercraft Fabric',
          capabilities:prepared.capabilities,
          returned:prepared.capabilities.length,
          transactional:false,
          external_action_taken:false,
        });
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/capabilities/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const raw=decodeURIComponent(parsed.pathname.slice('/capabilities/'.length));
        if(raw&&!raw.includes('/')){
          const wantsJson=raw.endsWith('.json');
          const publicId=wantsJson?raw.slice(0,-5):raw;
          const capability=preparedCatalog().capabilities.find((item)=>item.public_id===publicId);
          if(!capability) return sendJson(res,404,{error:'capability_not_found'});
          if(wantsJson) return sendJson(res,200,{
            ok:true,
            directory:'Evercraft Fabric',
            capability,
            transactional:false,
            external_action_taken:false,
          });
          return sendText(
            res,
            200,
            renderCapabilityDetail(capability),
            {contentType:'text/html; charset=utf-8'}
          );
        }
      }

      if (req.method==='GET' && req.url==='/assets/evercraft-icon.png') {
        return sendBuffer(res,200,brandIcon,{contentType:'image/png'});
      }

      if (req.method==='GET' && req.url==='/privacy') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Privacy Policy',docs.privacy),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/terms') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Terms of Service',docs.terms),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/support') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Support',docs.support),{contentType:'text/html; charset=utf-8'});
      }

      if (req.url===edgeAttestationPath) {
        if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
        const body=await readJson(req,{maxBytes:4096});
        try{
          return sendJson(res,200,{ok:true,...await nodeAttestation(body?.nonce)});
        }catch{
          return sendJson(res,503,{ok:false,error:'edge_attestation_unavailable'});
        }
      }

      if(req.method==='GET'||req.method==='HEAD'){
        const pathname=new URL(String(req.url||''),'http://fabric.local').pathname;
        const servicePage=resolveOwnedServicePage(pathname);
        if(servicePage){
          const payload=fs.readFileSync(servicePage);
          res.writeHead(200,{
            'content-type':'text/html; charset=utf-8',
            'content-length':payload.length,
            'cache-control':'public, max-age=60, must-revalidate',
            'x-content-type-options':'nosniff',
            'x-robots-tag':'noindex, nofollow',
            'referrer-policy':'no-referrer',
            'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
          });
          if(req.method==='HEAD')return res.end();
          return res.end(payload);
        }
      }

      if ((req.method==='GET'||req.method==='HEAD') && String(req.url||'').startsWith('/journal')) {
        const asset=resolveJournalAsset(journalDir,String(req.url||''));
        if(!asset) return sendJson(res,404,{error:'journal_asset_not_found'});
        const data=fs.readFileSync(asset);
        res.writeHead(200,{
          'content-type':journalContentType(asset),
          'content-length':data.length,
          'cache-control':'public, max-age=60, must-revalidate',
          'x-content-type-options':'nosniff',
          'x-robots-tag':'index, follow',
          'referrer-policy':'strict-origin-when-cross-origin',
        });
        if(req.method==='HEAD') return res.end();
        return res.end(data);
      }

      if ((req.method==='GET'||req.method==='HEAD') && String(req.url||'').startsWith('/demos')) {
        const asset=resolveDemoAsset(demoDir,String(req.url||''));
        if(!asset) return sendJson(res,404,{error:'demo_asset_not_found'});
        const data=fs.readFileSync(asset);
        res.writeHead(200,{
          'content-type':journalContentType(asset),
          'content-length':data.length,
          'cache-control':'public, max-age=60, must-revalidate',
          'x-content-type-options':'nosniff',
          'x-robots-tag':'noindex, nofollow',
          'referrer-policy':'strict-origin-when-cross-origin',
          'content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self' mailto:",
        });
        if(req.method==='HEAD') return res.end();
        return res.end(data);
      }

      if ((req.method==='GET'||req.method==='HEAD') && String(req.url||'').startsWith('/visuals')) {
        const asset=resolveVisualAsset(visualDir,String(req.url||''));
        if(!asset) return sendJson(res,404,{error:'visual_asset_not_found'});
        const data=fs.readFileSync(asset);
        res.writeHead(200,{
          'content-type':journalContentType(asset),
          'content-length':data.length,
          'cache-control':'public, max-age=60, must-revalidate',
          'x-content-type-options':'nosniff',
          'x-robots-tag':'index, follow',
          'referrer-policy':'strict-origin-when-cross-origin',
          'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
        });
        if(req.method==='HEAD') return res.end();
        return res.end(data);
      }

      if (req.url===challengePath) {
        if (!['GET','HEAD'].includes(req.method||'')) {
          return sendJson(res,405,{error:'method_not_allowed'});
        }
        if (!token) return sendJson(res,404,{error:'openai_challenge_not_configured'});
        const data=Buffer.from(token,'utf8');
        res.writeHead(200,{
          'content-type':'text/plain; charset=utf-8',
          'content-length':data.length,
          'cache-control':'no-store',
          'x-content-type-options':'nosniff',
        });
        if (req.method==='HEAD') return res.end();
        return res.end(data);
      }

      if (req.url!=='/mcp') return sendJson(res,404,{error:'not_found'});

      if (req.method==='GET') {
        const body={
          ok:true,
          service:'Evercraft Fabric',
          server:'evercraft-fabric',
          version:'1.0.1',
          transport:'Streamable HTTP',
          transport_modes:['application/json','text/event-stream'],
          tools:fabricDirectoryTools().map((tool)=>tool.name),
          capability_count:preparedCatalog().capabilities.length,
          read_only:true,
          base44_transport_enabled:false,
        };
        if (acceptsEventStream(req)) return sendEventStream(res,200,body);
        return sendJson(res,200,body);
      }

      if (req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
      const rpc=await readJson(req);
      const response=await executeFabricDirectoryRpc(rpc,preparedCatalog().capabilities);
      if (response===null) {
        res.writeHead(202,{
          'cache-control':'no-store',
          'mcp-protocol-version':'2025-03-26',
        });
        return res.end();
      }
      const sessionHeaders=rpc?.method==='initialize'
        ? {'mcp-session-id':crypto.randomUUID()}
        : {};
      if (acceptsEventStream(req)) return sendEventStream(res,200,response,sessionHeaders);
      return sendJson(res,200,response,sessionHeaders);
    } catch(error) {
      return sendJson(res,502,{
        jsonrpc:'2.0',
        id:null,
        error:{
          code:-32000,
          message:error instanceof Error?error.message:String(error),
        },
      });
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });

  if(studioAlertDispatcher.enabled){
    studioAlertDispatcher.start();
    void studioAlertDispatcher.dispatch().catch(()=>{});
  }

  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const url=`http://${host}:${actualPort}`;

  return {
    schema:'evercraft.fabric-local-runtime.v1',
    instanceId,
    url,
    mcpUrl:url+'/mcp',
    health,
    setDeploymentReceipt(value){
      const receipt=String(value||'').trim();
      if(!/^(?:sha256:)?[a-f0-9]{64}$/i.test(receipt)){
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef=receipt;
      return health();
    },
    close:async()=>{
      studioAlertDispatcher.stop();
      await faieSurface?.close();
      await new Promise((resolve,reject)=>
        server.close((error)=>error?reject(error):resolve())
      );
      if(visualStateEphemeral) fs.rmSync(visualDir,{recursive:true,force:true});
    },
  };
}

function arg(name,fallback=null) {
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (direct) {
  const host=String(arg('--host',process.env.EVERCRAFT_FABRIC_HOST||'127.0.0.1'));
  const port=Number(arg('--port',process.env.EVERCRAFT_FABRIC_PORT||'8787'));
  const challengeToken=String(arg('--openai-challenge-token',process.env.EVERCRAFT_OPENAI_CHALLENGE_TOKEN||''));
  const nodeReceiptPath=String(arg('--node-receipt',process.env.EVERCRAFT_EDGE_NODE_RECEIPT||''));
  const allocatorTokenFile=String(arg('--allocator-token-file',process.env.EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE||''));
  const visualStateDir=String(arg('--visual-state-dir',process.env.EVERCRAFT_VISUAL_STATE_DIR||''));
  const visualOrigin=String(arg('--visual-origin',process.env.EVERCRAFT_VISUAL_ORIGIN||'https://fabric.systemiacommandcenters.com/visuals'));
  const visualIngestTokenFile=String(arg(
    '--visual-ingest-token-file',
    process.env.EVERCRAFT_VISUAL_INGEST_TOKEN_FILE||'/var/lib/evercraft/fabric-secrets/visual-ingest-token'
  ));
  const sabanCapacityHealthFile=String(arg(
    '--saban-capacity-health-file',
    process.env.EVERCRAFT_SABAN_CAPACITY_HEALTH_FILE||
      '/var/lib/evercraft/fabric-secrets/saban-capacity-health.json'
  ));
  const releaseRefFile=String(arg(
    '--release-ref-file',
    process.env.EVERCRAFT_FABRIC_RELEASE_REF_FILE||
      '/var/lib/evercraft/fabric-update/runtime-release-ref'
  ));
  let visualIngestToken=String(process.env.EVERCRAFT_VISUAL_INGEST_TOKEN||'').trim();
  if(!visualIngestToken && visualIngestTokenFile && fs.existsSync(visualIngestTokenFile)){
    visualIngestToken=fs.readFileSync(visualIngestTokenFile,'utf8').trim();
  }
  const runtime=await startFabricLocalRuntime({
    host,port,challengeToken,nodeReceiptPath,allocatorTokenFile,
    visualStateDir,visualOrigin,visualIngestToken,sabanCapacityHealthFile,releaseRefFile
  });
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:runtime.schema,
    url:runtime.url,
    mcp_url:runtime.mcpUrl,
    ...runtime.health(),
  },null,2)+'\n');
  const shutdown=async()=>{
    await runtime.close();
    process.exit(0);
  };
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
}
