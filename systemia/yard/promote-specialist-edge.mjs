#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMOTABLE_SLUGS=new Set([
  'ibmi-rescue',
  'foundry-app-escape',
  'site-survive',
]);

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

function cleanHttpsOrigin(value){
  const raw=String(value||'').trim();
  const url=new URL(raw);
  if(url.protocol!=='https:') throw new Error('external_canary_origin_must_use_https');
  if(url.username||url.password||url.search||url.hash){
    throw new Error('external_canary_origin_must_be_clean');
  }
  if(url.pathname!==''&&url.pathname!=='/'){
    throw new Error('external_canary_origin_must_not_include_path');
  }
  if(/(^|\.)base44\.app$/i.test(url.hostname)){
    throw new Error('external_canary_origin_must_not_be_base44');
  }
  return url.origin;
}

export function validateExternalCanary(receipt){
  if(!receipt||receipt.schema!=='evercraft.public-edge.external-canary.v1'){
    throw new Error('external_canary_schema_invalid');
  }
  if(
    receipt.verified!==true ||
    receipt.state!=='public_https_verified' ||
    receipt.public_https_verified!==true ||
    receipt.mcp_initialize_verified!==true ||
    receipt.mcp_tools_list_verified!==true ||
    receipt.read_only_authority_verified!==true
  ){
    throw new Error('external_canary_not_verified');
  }
  if(receipt.runtime!=='Evercraft Compute'){
    throw new Error('external_canary_runtime_mismatch');
  }
  if(receipt.service!=='specialist-handoff-mcp'){
    throw new Error('external_canary_service_mismatch');
  }
  if(receipt.founder_login_required!==false){
    throw new Error('external_canary_founder_login_boundary_invalid');
  }
  if(receipt.external_saas_route_provider_required!==false){
    throw new Error('external_canary_route_provider_boundary_invalid');
  }
  const origin=cleanHttpsOrigin(receipt.origin);
  const instanceId=String(receipt.instance_id||'').trim();
  const deploymentReceipt=String(receipt.deployment_receipt_ref||'').trim();
  if(!instanceId) throw new Error('external_canary_instance_id_missing');
  if(!/^sha256:[a-f0-9]{64}$/i.test(deploymentReceipt)){
    throw new Error('external_canary_deployment_receipt_invalid');
  }
  return {
    origin,
    instance_id:instanceId,
    deployment_receipt_ref:deploymentReceipt,
    observed_at:String(receipt.observed_at||new Date().toISOString()),
  };
}

export function promoteSpecialistSpecs(specs,receipt){
  if(!specs||specs.schema!=='evercraft.direct-plugin-specs.v1'){
    throw new Error('direct_plugin_specs_schema_invalid');
  }
  const verified=validateExternalCanary(receipt);
  let changed=0;
  const promoted=[];

  for(const product of specs.products||[]){
    if(!PROMOTABLE_SLUGS.has(product.slug)) continue;
    if(product.state==='registry_published_direct_mcp_existing') continue;
    const runtimePath=String(product.runtime_path||'').trim();
    if(!runtimePath.startsWith('/mcp/')){
      throw new Error('promotable_product_runtime_path_invalid:'+product.slug);
    }
    const mcpUrl=verified.origin+runtimePath;
    const before=JSON.stringify({
      state:product.state,
      mcp_url:product.mcp_url,
      public_origin_state:product.public_origin_state,
      public_edge_canary:product.public_edge_canary,
    });

    product.state='public_https_verified_registry_pending';
    product.mcp_url=mcpUrl;
    product.registry_name=null;
    product.public_origin_state='external_canary_verified';
    product.public_edge_canary={
      schema:'evercraft.direct-door.public-edge-canary.v1',
      verified:true,
      origin:verified.origin,
      instance_id:verified.instance_id,
      deployment_receipt_ref:verified.deployment_receipt_ref,
      observed_at:verified.observed_at,
      promotion_scope:'public_execution_only',
      registry_publication_proven:false,
    };

    const after=JSON.stringify({
      state:product.state,
      mcp_url:product.mcp_url,
      public_origin_state:product.public_origin_state,
      public_edge_canary:product.public_edge_canary,
    });
    if(before!==after) changed++;
    promoted.push({
      slug:product.slug,
      mcp_url:mcpUrl,
      registry_state:'pending',
    });
  }

  if(promoted.length!==3){
    throw new Error('expected_three_promotable_specialists');
  }

  return {
    specs,
    receipt:{
      schema:'evercraft.direct-door.promotion-receipt.v1',
      changed,
      promoted,
      public_origin:verified.origin,
      source_deployment_receipt:verified.deployment_receipt_ref,
      source_instance_id:verified.instance_id,
      registry_publication_proven:false,
      promoted_at:new Date().toISOString(),
    },
  };
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const receiptPath=path.resolve(arg('--receipt','artifacts/evercraft-public-edge-canary.json'));
  const specPath=path.resolve(arg('--spec','distribution/direct-plugin-specs.json'));
  const outReceipt=path.resolve(arg('--out','artifacts/direct-door-promotion-receipt.json'));
  if(!fs.existsSync(receiptPath)) throw new Error('external_canary_receipt_missing');
  if(!fs.existsSync(specPath)) throw new Error('direct_plugin_specs_missing');

  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const specs=JSON.parse(fs.readFileSync(specPath,'utf8'));
  const promoted=promoteSpecialistSpecs(specs,receipt);

  fs.writeFileSync(specPath,JSON.stringify(promoted.specs,null,2)+'\n');
  fs.mkdirSync(path.dirname(outReceipt),{recursive:true});
  fs.writeFileSync(outReceipt,JSON.stringify(promoted.receipt,null,2)+'\n');
  console.log(JSON.stringify(promoted.receipt,null,2));
}
