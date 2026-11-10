#!/usr/bin/env node
// Public read-only Official MCP Registry inspection. No OAuth, publishing or provider mutations.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const API = 'https://registry.modelcontextprotocol.io';
const PREFIX = 'io.github.jgaethle10/';
const MAX_PAGES = 12;
const LEGACY = /(^|\.)base44\.app$/i;
export function summarizeRegistry(pages) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('no_registry_pages');
  const found = new Map();
  for (const page of pages) {
    if (!page || !Array.isArray(page.servers)) throw new Error('invalid_registry_response');
    for (const record of page.servers) {
      const s = record?.server;
      const name = s?.name;
      if (typeof name !== 'string' || !name.toLowerCase().startsWith(PREFIX)) continue;
      if (typeof s.version !== 'string' || !s.version.trim()) throw new Error('registry_version_missing');
      const existing = found.get(name);
      if (existing && existing.version !== s.version) throw new Error('duplicate_latest_version_conflict');
      const remotes = Array.isArray(s.remotes) ? s.remotes.map(x=>({
        type:typeof x.type==='string' ? x.type : null,
        url:typeof x.url==='string' ? x.url : null
      })) : [];
      const metadata = record._meta?.['io.modelcontextprotocol.registry/official'] || {};
      const findings = [];
      for (const remote of remotes) {
        if (!remote.url) {findings.push('REMOTE_URL_MISSING');continue;}
        let url;
        try { url = new URL(remote.url); } catch {findings.push('REMOTE_URL_INVALID');continue;}
        if (url.protocol !== 'https:') findings.push('REMOTE_NOT_HTTPS');
        if (LEGACY.test(url.hostname)) findings.push('LEGACY_BASE44_REMOTE');
      }
      found.set(name,{name,version:s.version,description:typeof s.description==='string'?s.description.slice(0,250):null,
        status:metadata.status||null,published_at:metadata.publishedAt||null,updated_at:metadata.updatedAt||null,
        remotes,findings:[...new Set(findings)],publisher_claim_verified:false});
    }
  }
  const servers=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name));
  if (!servers.length) throw new Error('no_evercraft_registry_entries_observed');
  return {servers,findings:servers.flatMap(x=>x.findings.map(issue=>({name:x.name,issue})))};
}
async function fetchPages({fetchFn=fetch,api=API}={}) {
  if (api!==API) throw new Error('registry_origin_not_allowed');
  const pages=[],seen=new Set();
  let cursor=null;
  for(let i=0;i<MAX_PAGES;i++){
    const url=new URL('/v0.1/servers',api);
    url.searchParams.set('search','io.github.jgaethle10');
    url.searchParams.set('version','latest');
    url.searchParams.set('limit','100');
    if(cursor)url.searchParams.set('cursor',cursor);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const res=await fetchFn(url.toString(),{method:'GET',signal:controller.signal,redirect:'error',headers:{'Accept':'application/json','User-Agent':'Evercraft-Distribution-Registry-Canary/1.0'}});
      if(!res.ok)throw new Error('registry_http_'+res.status);
      const parsed=await res.json();
      if(!parsed || !Array.isArray(parsed.servers))throw new Error('invalid_registry_response');
      pages.push(parsed);
      const next=parsed.metadata?.nextCursor;
      if(!next)return pages;
      if(typeof next!=='string'||seen.has(next))throw new Error('invalid_or_repeated_registry_cursor');
      seen.add(next);cursor=next;
    } finally {clearTimeout(timeout);}
  }
  throw new Error('registry_pagination_limit');
}
export async function run({fetchFn=fetch,output='/tmp/evercraft-registry-inspection.json'}={}) {
  let state='UNOBSERVED',servers=[],findings=[],error=null;
  try{
    const pages=await fetchPages({fetchFn});
    ({servers,findings}=summarizeRegistry(pages));
    state=findings.length?'OBSERVED_WITH_FINDINGS':'OBSERVED';
  }catch(e){error=e?.message||'registry_request_failed';}
  const receipt={schema:'evercraft.distribution.registry-inspection.v1',observed_at:new Date().toISOString(),
    source_api:API+'/v0.1/servers',scope:PREFIX,
    state,server_count:servers.length,servers,findings,
    ownership_note:'Public listing metadata never proves publisher account control or runtime tool reachability.',
    error};
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({state,server_count:servers.length,findings,error,receipt_path:output,servers:servers.map(s=>({name:s.name,version:s.version,remotes:s.remotes,findings:s.findings}))},null,2));
  if(state==='UNOBSERVED')process.exitCode=1;
  return receipt;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await run({output:process.env.EVERCRAFT_REGISTRY_RECEIPT_PATH||'/tmp/evercraft-registry-inspection.json'});
}
