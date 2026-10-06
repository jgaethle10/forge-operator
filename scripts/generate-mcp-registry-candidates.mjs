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
  ['systemia-remote-ops',{
    registry_name:'io.github.jgaethle10/systemia-remote-ops',
    title:'Systemia Remote Ops',
    description:'Read-only business decision simulation and routing for pricing, staffing, product or service changes, expansion, capital purchases, partnerships, acquisitions, business transactions, startup scenarios, and other consequential moves using transparent models and explicit caller-supplied assumptions.',
    version:'1.0.0',
  }],
  ['faie',{
    registry_name:'io.github.jgaethle10/faie',
    title:'FAIE',
    description:'Evidence-first food-infrastructure and resilience intelligence on owned Evercraft Fabric.',
    version:'1.1.0',
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

function receiptBackedCanary(product,slug){
  if(slug!=='faie') return null;
  const receiptRef=String(product?.live_canary_evidence||'').trim();
  if(!receiptRef) return null;
  const receiptPath=path.resolve(root,receiptRef);
  if(!fs.existsSync(receiptPath)) return null;
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const verified=
    receipt?.verified===true &&
    receipt?.state==='public_https_verified' &&
    receipt?.mcp_url===product?.mcp_url &&
    receipt?.checks?.faie_mcp_initialize===true &&
    receipt?.checks?.faie_mcp_tools===true &&
    receipt?.checks?.external_route===true &&
    receipt?.transport?.owner==='Evercraft Fabric' &&
    receipt?.transport?.mcp_verified===true &&
    receipt?.transport?.base44_transport_required===false &&
    receipt?.faie?.fabric_native===true &&
    receipt?.faie?.base44_transport_enabled===false;
  if(!verified) return null;
  return {
    verified:true,
    receipt_ref:receiptRef,
    mcp_tool_calls_verified:true,
    artifact_digest:String(receipt?.source?.artifact_digest||'')||null,
    receipt_hash:String(receipt?.source?.receipt_hash||'')||null,
    workflow_run_id:String(receipt?.source?.workflow_run_id||'')||null,
  };
}

const written=[];
for(const [slug,meta] of TARGETS){
  const product=(specs.products||[]).find(p=>p.slug===slug);
  if(!product) throw new Error('missing_direct_product:'+slug);

  const fieldBackedCanary=
    product.public_edge_canary?.verified===true &&
    product.public_edge_canary?.field_enrollment_verified===true &&
    product.public_edge_canary?.mcp_tool_calls_verified===true &&
    /^sha256:[a-f0-9]{64}$/i.test(String(product.public_edge_canary?.device_fingerprint||'')) &&
    /^sha256:[a-f0-9]{64}$/i.test(String(product.public_edge_canary?.field_enrollment_receipt_ref||'')) &&
    /^sha256:[a-f0-9]{64}$/i.test(String(product.public_edge_canary?.public_edge_admission_receipt_ref||''));
  const receiptCanary=receiptBackedCanary(product,slug);
  const executionCanary=fieldBackedCanary || Boolean(receiptCanary);
  const registryPublished=
    product.state==='registry_published_direct_mcp_existing' &&
    product.registry_name===meta.registry_name &&
    executionCanary;
  const executionVerified=
    (product.state==='public_https_verified_registry_pending' || registryPublished) &&
    product.public_origin_state==='external_canary_verified' &&
    cleanHttps(product.mcp_url) &&
    executionCanary;

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
    source_canary:fieldBackedCanary
      ? product.public_edge_canary
      : receiptCanary,
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
