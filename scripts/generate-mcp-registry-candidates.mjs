#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const specs=JSON.parse(
  fs.readFileSync(path.join(root,'distribution/direct-plugin-specs.json'),'utf8')
);
const outDir=path.join(root,'distribution/mcp-registry-candidates');
const checkOnly=process.argv.includes('--check');
fs.mkdirSync(outDir,{recursive:true});
const stable=(value)=>JSON.stringify(value,null,2)+'\n';

const TARGETS=new Map([
  ['ibmi-rescue',{
    registry_name:'io.github.jgaethle10/ibmi-rescue',
    title:'Evercraft IBM i Rescue',
    description:'IBM i and AS/400 estate assessment, dependency mapping, upgrade-risk review, modernization planning, and human-controlled service handoff.',
    version:'1.0.0',
  }],
  ['foundry-app-escape',{
    registry_name:'io.github.jgaethle10/foundry-app-escape',
    title:'Evercraft Foundry App Escape Audit',
    description:'App portability, builder lock-in, dependency, security, reconstruction, migration, and rollback analysis with human-controlled service handoff.',
    version:'1.0.0',
  }],
  ['site-survive',{
    registry_name:'io.github.jgaethle10/site-survive',
    title:'Site-Survive Rapid Audit',
    description:'Site continuity and connectivity-outage dependency analysis with prioritized resilience planning and human-controlled service handoff.',
    version:'1.0.0',
  }],
]);

function cleanHttps(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  }catch{return false;}
}

const written=[];
for(const [slug,meta] of TARGETS){
  const product=(specs.products||[]).find(p=>p.slug===slug);
  if(!product) throw new Error('missing_direct_product:'+slug);

  const registryPublished=
    product.state==='registry_published_direct_mcp_existing' &&
    product.registry_name===meta.registry_name;
  const executionVerified=
    (product.state==='public_https_verified_registry_pending' || registryPublished) &&
    product.public_origin_state==='external_canary_verified' &&
    cleanHttps(product.mcp_url) &&
    product.public_edge_canary?.verified===true;

  const candidate={
    schema:'evercraft.mcp-registry-candidate.v1',
    product:product.name,
    slug,
    publication_state:registryPublished
      ? 'publication_proven'
      : executionVerified
        ? 'ready_for_authorized_publication'
        : 'waiting_public_https_verification',
    desired_registry_name:meta.registry_name,
    registry_publication_proven:registryPublished,
    public_execution_verified:executionVerified,
    source_state:product.state,
    source_public_origin_state:product.public_origin_state||null,
    source_canary:product.public_edge_canary||null,
    manifest:(executionVerified || registryPublished) ? {
      '$schema':'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name:meta.registry_name,
      title:meta.title,
      description:meta.description,
      version:meta.version,
      websiteUrl:product.website_url,
      remotes:[{
        type:'streamable-http',
        url:product.mcp_url,
      }],
    } : null,
    release_rule:'Candidate preparation never proves registry publication. Materialization into mcp-registry/ and publication remain governed by Systemia release authorization and the official MCP Registry publisher.',
  };

  const file=path.join(outDir,slug+'.json');
  const content=stable(candidate);
  if(checkOnly){
    if(!fs.existsSync(file)) throw new Error('registry_candidate_missing:'+slug);
    const current=fs.readFileSync(file,'utf8');
    if(current!==content) throw new Error('registry_candidate_drift:'+slug);
  }else{
    fs.writeFileSync(file,content);
  }
  written.push({
    slug,
    publication_state:candidate.publication_state,
    manifest_ready:Boolean(candidate.manifest),
    file:path.relative(root,file),
  });
}

console.log(JSON.stringify({
  schema:'evercraft.mcp-registry-candidate-generation.v1',
  mode:checkOnly?'check':'generate',
  candidates:written,
},null,2));
