#!/usr/bin/env node
// Non-mutating, no-network, local capability census for Fallen Studios / Saban.
// No package installation, model download, job dispatch, rental, or publishing.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const registryPath=new URL('./toolchain-registry.json',import.meta.url);
const commands={
  ffmpeg:['ffmpeg',['-version']],
  opentimelineio:['python3',['-c','import opentimelineio as o; print(o.__version__)']],
  blender:['blender',['--version']],
  kdenlive:['kdenlive',['--version']],
  mlt:['melt',['-version']],
};

export function inspectLocalTools(registry,run=spawnSync){
  if(registry?.schema!=='evercraft.fallen.open-source-toolchain.v1'||!Array.isArray(registry.tools)){
    throw new Error('open_source_registry_invalid');
  }
  const rows=[];
  const seen=new Set();
  for(const tool of registry.tools){
    if(seen.has(tool.id))throw new Error('open_source_duplicate_id');
    seen.add(tool.id);
    if(!/^[a-f0-9]{40}$/.test(tool.commit??''))throw new Error('open_source_upstream_commit_unpinned:'+tool.id);
    if(typeof tool.license!=='string'||!tool.license.trim())throw new Error('open_source_license_unreviewed:'+tool.id);
    const cmd=commands[tool.id];
    if(!cmd){
      rows.push({id:tool.id,installed:'not_probed',reason:'manual_hardware_and_rights_admission_required',routable:false});
      continue;
    }
    let result;
    try{
      result=run(cmd[0],cmd[1],{
        encoding:'utf8',timeout:3500,maxBuffer:1024*128,
        stdio:['ignore','pipe','pipe'],shell:false,
      });
    }catch{
      result={status:127,error:new Error('not_found')};
    }
    const success=result?.status===0&&!result?.error;
    const first=String(result?.stdout||result?.stderr||'').trim().split('\n')[0].slice(0,180);
    rows.push({
      id:tool.id,installed:success?'verified_local_binary':'not_detected',
      versionBanner:success?first:null,
      // A process responding to a version check is NOT proof it may run trusted media workloads.
      routable:false,
      reason:success?'independent_node_attestation_and_workload_contract_required':'no_working_local_tool_detected',
    });
  }
  return {
    schema:'evercraft.fallen.open-source-local-probe.v1',
    recordedAt:new Date().toISOString(),
    tools:rows,
    readyForAutonomousExecution:false,
    publicationAuthorityGranted:false,
    spendAuthorityGranted:false,
    systemiaAdmissionRequired:true,
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  console.log(JSON.stringify(inspectLocalTools(registry),null,2));
}
