#!/usr/bin/env node
// Turns observed public registry metadata into an evidence-gated repoint work queue.
// Never submits, edits, deprecates, logs into or publishes to a third-party registry.
import {readFileSync,writeFileSync} from 'node:fs';
const PREFIX='io.github.jgaethle10/';
const OWNED='fabric.systemiacommandcenters.com';
const commercialPriority=['evercraft-machine-commerce','findmypart','forensiscope','aliev','evercraft-clip','career-command'];
export function buildQueue(receipt){
  if(receipt?.schema!=='evercraft.distribution.registry-inspection.v1' ||
      !['OBSERVED','OBSERVED_WITH_FINDINGS'].includes(receipt.state) || !Array.isArray(receipt.servers)) {
    throw new Error('registry_observation_required');
  }
  const entries=receipt.servers.map(s=>{
    if(typeof s.name!=='string'||!s.name.startsWith(PREFIX)||!s.version)throw new Error('invalid_registry_entry');
    const remoteUrls=(s.remotes||[]).map(r=>r.url).filter(Boolean);
    const legacy=(s.findings||[]).includes('LEGACY_BASE44_REMOTE');
    const ownedRemote=remoteUrls.length>0&&remoteUrls.every(value=>{
      try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===OWNED;}catch{return false;}
    });
    const state=legacy?'REPOINT_REQUIRES_VERIFIED_OWNED_SPECIALIST':
      ownedRemote?'OWNED_REMOTE_ADVERTISED_RUNTIME_CANARY_REQUIRED':'REMOTE_AUDIT_REQUIRED';
    const slug=s.name.slice(PREFIX.length);
    return {registry_name:s.name,registry_version:s.version,published_remotes:remoteUrls,
      state,priority:commercialPriority.includes(slug)?'P0':'P1',
      external_registry_publish_authorized:false,
      owned_specialist_runtime_verified:false,
      required_evidence:legacy?[
        'Specialist function on owned infrastructure proven with a real MCP initialize and tools/list call',
        'Exact namespace/manifest/offer route reviewed; do not mask individual specialist as universal tool endpoint',
        'Authorized registry publisher authentication and versioned submission receipt',
        'Requery official registry latest; verify advertised remote equals tested destination'
      ]:[
        'Cold-client initialize and tools/list against the advertised HTTPS MCP endpoint',
        'Verify public registry metadata, provider permissions and first-party source authority'
      ]};
  }).sort((a,b)=>(a.priority===b.priority?a.registry_name.localeCompare(b.registry_name):a.priority==='P0'?-1:1));
  const totals={servers:entries.length,legacy_base44:entries.filter(x=>x.state==='REPOINT_REQUIRES_VERIFIED_OWNED_SPECIALIST').length,
    owned_fabric_advertised:entries.filter(x=>x.state==='OWNED_REMOTE_ADVERTISED_RUNTIME_CANARY_REQUIRED').length,
    other:entries.filter(x=>x.state==='REMOTE_AUDIT_REQUIRED').length};
  return {schema:'evercraft.distribution.registry-repoint-queue.v1',
    observed_at:receipt.observed_at,generated_at:new Date().toISOString(),source:'official_mcp_registry_readonly',
    totals,publication_policy:'ALL_ENQUEUED_NOT_AUTHORIZED',
    warning:'No legacy endpoint is automatically repointed to the universal Fabric MCP. Own the specialist route first.',
    entries};
}
const running=process.argv[1]&&process.argv[1].endsWith('build-registry-repoint-queue.mjs');
if(running){
  const source=process.argv[2]||'/tmp/evercraft-registry-inspection.json';
  const out=process.argv[3]||'/tmp/evercraft-registry-repoint-queue.json';
  const result=buildQueue(JSON.parse(readFileSync(source,'utf8')));
  writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({receipt_path:out,totals:result.totals,publication_policy:result.publication_policy,top_priority:result.entries.filter(x=>x.priority==='P0').map(x=>({name:x.registry_name,state:x.state}))},null,2));
}
