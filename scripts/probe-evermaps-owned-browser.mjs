// Browser acceptance for the owned EverMaps preview served by a running Forge container.
// Deterministic, locally mocked NIFC incident responses allow UI testing without
// pretending that a third-party dataset is available or that flames are active.
// Real upstream/network verification belongs to probe-evermaps-owned-http.mjs.
// Usage: node scripts/probe-evermaps-owned-browser.mjs
// Requires playwright Chromium installed on test runner. No browser secrets used.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin=process.env.EVERMAPS_SMOKE_ORIGIN||'http://127.0.0.1:3000';
const output=resolve(process.env.EVERMAPS_BROWSER_EVIDENCE_DIR||'artifacts/evermaps-browser-qa');
const timeoutMs=Number(process.env.EVERMAPS_BROWSER_TIMEOUT_MS||65000);
const controller=AbortSignal.timeout(timeoutMs);
const now=Date.now();
const modified=new Date(now-3600_000).toISOString();
const sample=(id,name,latitude,longitude)=>({
 incident_id:id,name,latitude,longitude,
 modified_at_utc:modified,
 reported_acres:150,
 reported_containment_percent:55,
 evidence_state:'SOURCE_REPORTED_INCIDENT_NOT_BURNING_CONFIRMATION'
});
const fixture={
 schema:'evercraft.evermaps.incident-observations.v1',
 count:3,
 records:[
  sample('qa1','Yakima Ridge',46.6021,-120.5059),
  sample('qa2','Rattlesnake Ridge',46.609,-120.526),
  sample('qa3','Seattle Hills',47.6062,-122.3321)
 ],
 fetched_at_utc:new Date(now).toISOString(),
 guarantees:{
  current_feed_is_burning_confirmation:false,
  location_is_fire_perimeter:false,
  evacuation_guidance:false,
  zero_records_proves_zero_fires:false
 }
};
function assert(condition,description){if(!condition)throw Error('BROWSER_QA_BLOCKED: '+description);}
const checkOrigin=new URL(origin);
assert(
 (checkOrigin.protocol==='http:'&&['localhost','127.0.0.1'].includes(checkOrigin.hostname))||
 (checkOrigin.protocol==='https:'&&!/\.base44\.app$/i.test(checkOrigin.hostname)),
 'origin must be loopback HTTP or owned HTTPS'
);
assert(!checkOrigin.username&&!checkOrigin.password&&['','/'].includes(checkOrigin.pathname)&&!checkOrigin.search&&!checkOrigin.hash,
 'origin must not include credentials or a path'
);
await mkdir(output,{recursive:true});
const receipt={
 schema:'evercraft.evermaps.owned-browser-qa.v1',
 observed_at_utc:new Date().toISOString(),
 origin:checkOrigin.origin,
 fixture_provenance:'synthetic local source response, for behavior regression only',
 live_source_verification:'SEPARATE_CONTAINER_HTTP_PROBE',
 base_raster_test:'Third-party OSM tile delivery deliberately unavailable; owned Natural Earth outline must render',
 browser:'Playwright Chromium, no physical iOS/Android or VR headset',
 safety_authority:false,
 published_release:false,
 scenarios:[]
};
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const profile of [
  {name:'desktop',viewport:{width:1440,height:900},hasTouch:false,isMobile:false},
  {name:'phone-emulation',viewport:{width:390,height:844},hasTouch:true,isMobile:true}
 ]){
  if(controller.aborted)throw Error('Browser QA timed out');
  const context=await browser.newContext({
   viewport:profile.viewport,deviceScaleFactor:1,
   isMobile:profile.isMobile,hasTouch:profile.hasTouch
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
  // Force public tile delivery failure to verify an independently sourced fallback instead of a blank map.
  await page.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
  // A controlled source response is necessary for deterministic UI behavior.
  let sourceDown=false;
  await page.route('**/api/evermaps/incidents/pnw',route=>
   route.fulfill({
    status:sourceDown?503:200,
    contentType:'application/json',
    body:JSON.stringify(sourceDown?{
     schema:'evercraft.evermaps.incident-observations.v1',
     status:'SOURCE_UNAVAILABLE',count:null,records:[],
     source:'NIFC WFIGS'
    }:fixture)
   })
  );
  const http=await page.goto(checkOrigin.origin+'/evermaps/',{waitUntil:'domcontentloaded',timeout:17000});
  assert(http?.status()===200,profile.name+' failed navigation');
  await page.waitForFunction(()=>document.querySelector('#em-count')?.textContent==='3',{timeout:16000});
  await page.waitForFunction(()=>document.querySelector('#em-fallback')?.dataset.source==='natural-earth-50m-public-domain'&&document.querySelectorAll('#em-fallback path').length>=1,null,{timeout:14000});
  await page.evaluate(()=>{
   const badge=document.createElement('div');
   badge.id='em-browser-qa-fixture-label';
   badge.textContent='SYNTHETIC QA DATA · NOT REAL FIRE INCIDENTS';
   badge.setAttribute('aria-hidden','true');
   badge.style.cssText='position:absolute;z-index:60;top:14px;right:12px;max-width:250px;padding:7px 10px;border-radius:9px;background:#4f3117ed;border:1px solid #f7ca84;color:#fff3dd;font-size:10px;font-weight:800;letter-spacing:.05em;line-height:1.5;pointer-events:none;text-align:center';
   document.querySelector('#em-map').appendChild(badge);
  });
  const initial=await page.evaluate(()=>{
   const map=document.querySelector('#em-map')?.getBoundingClientRect();
   const panel=document.querySelector('.em-panel')?.getBoundingClientRect();
   const hint=document.querySelector('.em-map-hint')?.getBoundingClientRect();
   const attribution=document.querySelector('.em-map-credit')?.getBoundingClientRect();
   const creditHintOverlap=!!(hint&&attribution&&hint.left<attribution.right&&hint.right>attribution.left&&hint.top<attribution.bottom&&hint.bottom>attribution.top);
   return{
    count:document.querySelector('#em-count')?.textContent,
    groups:document.querySelector('#em-groups')?.textContent,
    markers:document.querySelectorAll('.em-marker').length,
    clearly_marked_synthetic_fixture:document.querySelector('#em-browser-qa-fixture-label')?.textContent?.includes('NOT REAL FIRE INCIDENTS'),
    fallback_shapes:document.querySelectorAll('#em-fallback path').length,
    fallback_source:document.querySelector('#em-fallback')?.dataset.source,
    raster_display_state:document.querySelector('#em-tiles')?.dataset.state,
    raster_opacity:getComputedStyle(document.querySelector('#em-tiles')).opacity,
    source_status:document.querySelector('#em-source')?.dataset.state,
    width:innerWidth,document_width:document.documentElement.scrollWidth,
    map_width:map?.width,panel_width:panel?.width,credit_hint_overlap:creditHintOverlap,
    attribution:document.querySelector('.em-map-credit')?.textContent?.trim()||'',
    safety_language:document.body.innerText.includes('not a confirmation of ongoing combustion'),
    noindex:document.querySelector('meta[name="robots"]')?.content==='noindex,nofollow'
   };
  });
  assert(initial.count==='3',profile.name+' reported count was not 3');
  assert(initial.source_status==='ready',profile.name+' did not reach source ready state');
  assert(initial.markers>0,profile.name+' has no rendered incident marker');
  assert(initial.clearly_marked_synthetic_fixture===true,profile.name+' fixture screenshot missing visible synthetic-data disclosure');
  assert(initial.fallback_shapes>=1&&initial.fallback_source==='natural-earth-50m-public-domain',profile.name+' has no sourced geographic fallback');
  assert(initial.raster_display_state==='geography-fallback'&&Number(initial.raster_opacity)===0,profile.name+' showed partially loaded third-party tiles');
  assert(initial.document_width<=initial.width+3,profile.name+' horizontal overflow');
  assert(initial.map_width<=initial.width+3,profile.name+' map overflow');
  assert(initial.panel_width<=initial.width+3,profile.name+' panel overflow');
  assert(initial.noindex,profile.name+' preview not noindex');
  assert(initial.credit_hint_overlap===false,profile.name+' geographic attribution overlaps map controls');
  assert(initial.attribution.includes('OpenStreetMap contributors')&&initial.attribution.includes('Natural Earth'),profile.name+' missing both geographic source credits');
  assert(initial.safety_language,profile.name+' missing incident limitation');
  await page.screenshot({path:output+'/'+profile.name+'-normal.png',animations:'disabled',timeout:10000});
  await page.locator('#em-increase').click();
  await page.waitForFunction(()=>document.querySelector('#em-zoom-label')?.textContent?.includes('6'));
  const zoomLevel=await page.locator('#em-zoom-label').textContent();
  await page.locator('#em-layer-toggle').uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.em-marker').length===0&&document.querySelector('#em-groups')?.textContent==='Off');
  const off=await page.locator('#em-list').innerText();
  assert(off.includes('layer is off'),profile.name+' layer off state not communicated');
  await page.locator('#em-layer-toggle').check();
  await page.waitForFunction(()=>document.querySelector('#em-count')?.textContent==='3');
  sourceDown=true;
  await page.locator('#em-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#em-source')?.dataset.state==='unavailable');
  const failure=await page.evaluate(()=>({
   count:document.querySelector('#em-count')?.textContent,
   marker_count:document.querySelectorAll('.em-marker').length,
   source:document.querySelector('#em-source')?.innerText?.trim(),
   list:document.querySelector('#em-list')?.innerText?.trim()
  }));
  assert(failure.count==='—',profile.name+' displayed stale numeric count during upstream outage');
  assert(failure.marker_count===0,profile.name+' retained incident markers after source failure');
  assert(failure.list.includes('cleared'),profile.name+' missing fail-closed explanation');
  assert(errors.length===0,profile.name+' JavaScript page exceptions: '+errors.join('; '));
  await page.screenshot({path:output+'/'+profile.name+'-source-unavailable.png',animations:'disabled',timeout:10000});
  receipt.scenarios.push({profile:profile.name,status:'PASS',initial,zoomLevel,layerOffCommunicated:true,
   unavailable:failure,uncaught_page_errors:errors,
   screenshot_normal:profile.name+'-normal.png',
   screenshot_unavailable:profile.name+'-source-unavailable.png'});
  await context.close();
 }
 receipt.status='PASS';
}catch(error){
 receipt.status='BLOCKED';
 receipt.error=String(error?.message||error).slice(0,1000);
 process.exitCode=1;
}finally{
 await browser?.close().catch(()=>{});
 await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({schema:receipt.schema,status:receipt.status,scenarios:receipt.scenarios.map(x=>({profile:x.profile,status:x.status,markers:x.initial.markers,overflow:x.initial.document_width>x.initial.width+3,unavailableMarkers:x.unavailable.marker_count})),error:receipt.error||null}));
}
