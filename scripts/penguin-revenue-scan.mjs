#!/usr/bin/env node
// Evidence-only website prospect scanner. User-supplied targets; no discovery, sending or checkout.
// Public HTML GET only, no redirects, no authenticated endpoints.
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {processEntries} from './penguin-revenue-desk.mjs';

function publicIp(ip){
  if(net.isIP(ip)===4){
    const n=ip.split('.').map(Number), [a,b]=n;
    if(a===0||a===10||a===127||a>=224||a===169&&b===254||
       a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||
       a===192&&b===0||a===198&&(b===18||b===19)||a===192&&b===0&&n[2]===2||
       a===198&&b===51&&n[2]===100||a===203&&b===0&&n[2]===113) return false;
    return true;
  }
  if(net.isIP(ip)===6){
    const x=ip.toLowerCase();
    if(x==='::1'||x==='::'||x.startsWith('fe80:')||x.startsWith('fc')||x.startsWith('fd')||
       x.startsWith('ff')||x.startsWith('2001:db8:')||x.startsWith('::ffff:'))return false;
    return true;
  }
  return false;
}
export function validateTarget(target){
  if(!target||typeof target!=='object')throw Error('invalid_target');
  const company=String(target.company||'').trim().slice(0,120);
  const u=new URL(target.site);
  if(!company||u.protocol!=='https:'||u.port||u.username||u.password||
     net.isIP(u.hostname)||!u.hostname.includes('.')||
     !/^[a-z0-9.-]+$/i.test(u.hostname)||u.hostname.endsWith('.local')||
     u.hostname.endsWith('.internal')||u.hostname.endsWith('.localhost'))throw Error('invalid_public_target');
  if(u.pathname!=='/'||u.search||u.hash)throw Error('homepage_only');
  return {company,site:u.origin+'/',contact_name:String(target.contact_name||'').trim().slice(0,100),
    contact_email:String(target.contact_email||'').trim().slice(0,200)};
}
export function observeHomepage(html,site,day){
  if(typeof html!=='string')return [];
  const anchors=[...html.matchAll(/<a\b[^>]*>/gi)].map(m=>m[0]);
  const visible=anchors.filter(t=>!/(?:rel\s*=\s*["']?nofollow|aria-hidden\s*=\s*["']?true)/i.test(t));
  const contact=visible.some(t=>/href\s*=\s*["'](?:mailto:|tel:|[^"']*(?:contact|quote|estimate|book|appointment))/i.test(t));
  if(contact)return [];
  if(visible.length<2)return []; // JS sites and sparse markup are inconclusive
  return [{issue:'other',source:site,checked_at:day,
    evidence:'In the fetched homepage HTML, none of the '+visible.length+
      ' anchor tags had an obvious contact, quote, estimate, booking, email, or telephone destination. This is only a source-HTML observation, not proof that the live website lacks a contact action.'}];
}
export async function scanTarget(input,{lookup=dns.lookup,fetcher=fetch,now=new Date()}={}){
  let t;
  try{t=validateTarget(input)}catch(e){return {state:'rejected',reason:String(e.message)}}
  try{
    const resolved=await lookup(new URL(t.site).hostname,{all:true});
    if(!Array.isArray(resolved)||!resolved.length||resolved.some(r=>!publicIp(r.address)))
      return {state:'held',company:t.company,reason:'non_public_dns'};
    // DNS preflight mitigates accidental local targets; DNS rebinding remains possible.
    // Run this tool only against trusted operator-selected public domains.
    const response=await fetcher(t.site,{redirect:'manual',signal:AbortSignal.timeout(8000),
      headers:{'user-agent':'Evercraft-Revenue-Desk-Research/1.0','accept':'text/html'}});
    if(!response.ok)return {state:'held',company:t.company,reason:'http_'+response.status};
    if(!String(response.headers.get('content-type')||'').includes('text/html'))
      return {state:'held',company:t.company,reason:'not_html'};
    const body=await response.text();
    if(Buffer.byteLength(body)>750_000)return {state:'held',company:t.company,reason:'oversize_html'};
    const observations=observeHomepage(body,t.site,now.toISOString().slice(0,10));
    if(!observations.length)return {state:'held',company:t.company,reason:'no_actionable_html_evidence'};
    return {state:'observed',entry:{...t,observations}};
  }catch(e){return {state:'held',company:t.company,reason:'fetch_failed_'+String(e.name||'unknown')}}
}
export async function scanTargets(targets,opts={}){
  if(!Array.isArray(targets)||targets.length>30)throw Error('Expected up to 30 targets');
  const scans=[];
  for(const target of targets)scans.push(await scanTarget(target,opts));
  return {scans,desk:processEntries(scans.filter(x=>x.state==='observed').map(x=>x.entry))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const at=process.argv.indexOf('--targets');
  if(at<0||!process.argv[at+1]){console.error('Usage: node scripts/penguin-revenue-scan.mjs --targets /private/targets.json');process.exitCode=2}
  else{
    try{
      const file=process.argv[at+1],stat=fs.statSync(file);
      if(!stat.isFile()||stat.size>50_000)throw Error('targets_file_too_large');
      const targets=JSON.parse(fs.readFileSync(file,'utf8'));
      console.log(JSON.stringify(await scanTargets(targets),null,2));
    }catch(e){console.error(e.message);process.exitCode=1}
  }
}
