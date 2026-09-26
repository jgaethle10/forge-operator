#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const candidateDir=path.join(root,'distribution/mcp-registry-candidates');
const registryDir=path.join(root,'mcp-registry');
const outPath=path.resolve(
  process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out')+1]
    : 'artifacts/mcp-registry-materialization-receipt.json'
);

const TARGETS=['ibmi-rescue','foundry-app-escape','site-survive'];
fs.mkdirSync(registryDir,{recursive:true});

const materialized=[];
const held=[];

for(const slug of TARGETS){
  const candidatePath=path.join(candidateDir,slug+'.json');
  if(!fs.existsSync(candidatePath)) throw new Error('registry_candidate_missing:'+slug);
  const candidate=JSON.parse(fs.readFileSync(candidatePath,'utf8'));

  if(candidate.schema!=='evercraft.mcp-registry-candidate.v1'){
    throw new Error('registry_candidate_schema_invalid:'+slug);
  }
  if(candidate.slug!==slug) throw new Error('registry_candidate_slug_mismatch:'+slug);
  if(candidate.registry_publication_proven===true){
    held.push({slug,reason:'already_published'});
    continue;
  }
  if(candidate.publication_state!=='ready_for_authorized_publication'){
    held.push({slug,reason:candidate.publication_state});
    continue;
  }
  if(candidate.public_execution_verified!==true||!candidate.manifest){
    throw new Error('registry_candidate_execution_proof_missing:'+slug);
  }
  const remote=String(candidate.manifest?.remotes?.[0]?.url||'');
  const remoteUrl=new URL(remote);
  if(remoteUrl.protocol!=='https:') throw new Error('registry_candidate_remote_not_https:'+slug);
  if(/(^|\.)base44\.app$/i.test(remoteUrl.hostname)){
    throw new Error('registry_candidate_remote_must_not_be_base44:'+slug);
  }
  if(candidate.manifest.name!==candidate.desired_registry_name){
    throw new Error('registry_candidate_name_mismatch:'+slug);
  }

  const target=path.join(registryDir,slug+'.json');
  const content=JSON.stringify(candidate.manifest,null,2)+'\n';
  if(fs.existsSync(target)){
    const current=fs.readFileSync(target,'utf8');
    if(current!==content){
      throw new Error('registry_manifest_conflict:'+slug);
    }
    materialized.push({slug,path:path.relative(root,target),state:'already_materialized_identical'});
  }else{
    fs.writeFileSync(target,content);
    materialized.push({slug,path:path.relative(root,target),state:'materialized_publication_request'});
  }
}

const receipt={
  schema:'evercraft.mcp-registry.materialization-receipt.v1',
  registry_publication_proven:false,
  materialized,
  held,
  rule:'Materialization is a publication request only. Official MCP Registry publication remains unproven until the authorized registry publisher succeeds.',
  materialized_at:new Date().toISOString(),
};
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
