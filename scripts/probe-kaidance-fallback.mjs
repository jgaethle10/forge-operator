#!/usr/bin/env node
// Public GitHub Pages *fallback* canary. This checks the real viewer over HTTPS,
// never asserts private Systemia/Yard execution or field heartbeat publication.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const FILES=Object.freeze([
 'index.html','app.mjs','style.css','experience.css','collider-v3.css','confluence.css','signal-wall.css','visual.mjs','signal-river.mjs','collider-engine.mjs','current-field.mjs','field-chapters.mjs','field-topology.mjs','pulse-source.mjs','work-source.mjs','mark.svg'
]);
const MAX_BYTES=300_000;

function pageRoot(root) {
 let u;
 try { u=new URL(root); } catch { throw Error('invalid_pages_root') }
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash ||
    u.hostname!=='jgaethle10.github.io'||!/^\/forge-operator\/?$/.test(u.pathname)) {
   throw Error('pages_root_must_be_verified_repository_fallback');
 }
 return new URL('https://jgaethle10.github.io/forge-operator/kaidance/');
}
async function getText(url,{fetchImpl=fetch}={}) {
 const res=await fetchImpl(url,{method:'GET',credentials:'omit',
   redirect:'error',cache:'no-store',headers:{Accept:'*/*'},
   signal:AbortSignal.timeout(12_000)});
 if(!res.ok)throw Error('public_response_'+res.status+'_'+url.pathname.split('/').pop());
 let text=await res.text();
 if(text.length<20||text.length>MAX_BYTES)throw Error('public_size_invalid_'+url.pathname.split('/').pop());
 return {text,status:res.status,contentType:res.headers.get('content-type')||''};
}
export async function probeKaidanceFallback({root,fetchImpl=fetch,now=new Date()}={}) {
 const base=pageRoot(root);
 const results={};
 for(const file of FILES) {
   const url=file==='index.html'?base:new URL(file,base);
   results[file]=await getText(url,{fetchImpl});
 }
 const html=results['index.html'].text;
 const app=results['app.mjs'].text;
 const source=results['pulse-source.mjs'].text;
 const work=results['work-source.mjs'].text;
 if(!/text\/html/i.test(results['index.html'].contentType))throw Error('fallback_not_html');
 for(const expected of [
    'KAIDANCE | Evercraft in Motion','9:16 LIVE VIEW',
    'HEARTBEAT NOT CONNECTED','./app.mjs','./style.css','./experience.css','./collider-v3.css','./confluence.css','./signal-wall.css','./visual.mjs','./signal-river.mjs','./collider-engine.mjs','./current-field.mjs','./mark.svg'
 ])if(!html.includes(expected))throw Error('fallback_missing_'+expected);
 if(!app.includes("from './pulse-source.mjs'")||
    !app.includes("from './work-source.mjs'")||
    !app.includes("fetch('./pulse.json'"))throw Error('fallback_client_provenance_missing');
 if(!source.includes('assessPublicPulse')||!work.includes('normalizePublicActivity'))throw Error('fallback_source_validation_missing');
 if(!results['signal-wall.css'].text.includes('KAIDANCE V06') ||
    !results['signal-river.mjs'].text.includes('KAIDANCE V06') ||
    !html.includes('id="signalRiver"') || !html.includes('id="signalSpotlight"') ||
    !html.includes('class="brand-symbol" src="./mark.svg"'))throw Error('fallback_signal_wall_missing');
 if(!results['mark.svg'].text.includes('<title id="title">Kaidance</title>'))throw Error('fallback_kaidance_brand_missing');
 if(!results['current-field.mjs'].text.includes("from './field-chapters.mjs'")||
    !results['current-field.mjs'].text.includes("from './field-topology.mjs'"))throw Error('fallback_chapter_import_missing');
 if(!results['field-topology.mjs'].text.includes('CONFLUENCE_CONNECTIONS')||
    !results['field-topology.mjs'].text.includes('SCENIC_ROUTES'))throw Error('fallback_field_topology_missing');
 if(!results['current-field.mjs'].text.includes('CONFLUENCE FIELD V07')||
    !results['confluence.css'].text.includes('KAIDANCE V04')||
    !results['field-chapters.mjs'].text.includes('SCENIC_LEG_SECONDS'))throw Error('fallback_current_field_assets_missing');
 if(!html.includes('id="fieldRouteProgress"')||!html.includes('id="fieldRecordTopic"'))throw Error('fallback_story_choreography_missing');
 if(!results['collider-engine.mjs'].text.includes('AMBIENT ART')||
    !results['collider-v3.css'].text.includes('KAIDANCE COLLIDER V03'))throw Error('fallback_reactor_assets_missing');
 if(!results['visual.mjs'].text.includes('Ambient art only')||
    !results['experience.css'].text.includes('KAIDANCE V02'))throw Error('fallback_visual_artifact_missing');
 if(!app.includes("$('heroEventTitle')")||!app.includes("$('heroProgress')"))throw Error('fallback_first_screen_evidence_missing');
 if(!/image\/svg\+xml/i.test(results['mark.svg'].contentType))throw Error('fallback_brand_asset_invalid');
 if(html.includes('localhost:')||html.includes('127.0.0.1:'))throw Error('fallback_contains_local_network_reference');

 // The static GitHub Pages fallback must NEVER carry private or purported live
 // Collider JSON. The approved public heartbeat belongs to the owned edge.
 const pulseUrl=new URL('pulse.json',base);
 const pulse=await fetchImpl(pulseUrl,{method:'GET',credentials:'omit',
   redirect:'error',cache:'no-store',headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(12_000)});
 if(pulse.status!==404)throw Error('fallback_heartbeat_must_not_be_published_on_pages');

 return {
  schema:'evercraft.kaidance.public-fallback-readback.v1',
  result:'public_viewer_verified',
  url:base.href,
  verified_assets:FILES,
  approved_live_pulse:'not_present_on_fallback',
  source:'external_https_public_pages',
  checked_at:now.toISOString(),
  index_sha256:createHash('sha256').update(html).digest('hex'),
  limitation:'Static Pages viewer only. No real field Collider activation or owned runtime verified.'
 };
}
function flag(key) {const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1]||null;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=flag('--root')||process.argv[2];
 if(!root){console.error('usage: node scripts/probe-kaidance-fallback.mjs --root https://jgaethle10.github.io/forge-operator/');process.exitCode=2}
 else {
  try {
   const report=await probeKaidanceFallback({root});
   fs.mkdirSync('artifacts',{recursive:true});
   fs.writeFileSync('artifacts/kaidance-fallback-readback.json',JSON.stringify(report,null,2)+'\n',{mode:0o644});
   console.log(JSON.stringify(report,null,2));
  }catch(error){console.error('KAIDANCE_PUBLIC_VIEWER_HELD:',String(error?.message||error));process.exitCode=1}
 }
}
