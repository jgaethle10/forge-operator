#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha256=(value)=>'sha256:'+createHash('sha256').update(value).digest('hex');
const readJson=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');

export function normalizeOwnedOrigin(raw){
  const url=new URL(String(raw||''));
  if(url.protocol!=='https:') throw new Error('owned_fabric_origin_must_use_https');
  if(url.username||url.password||url.search||url.hash) throw new Error('owned_fabric_origin_must_be_clean');
  if(url.pathname!==''&&url.pathname!=='/') throw new Error('owned_fabric_origin_must_not_include_path');
  const host=url.hostname.toLowerCase();
  if(/(^|\.)base44\.app$/.test(host)) throw new Error('owned_fabric_origin_must_not_be_base44');
  if(['localhost','127.0.0.1','0.0.0.0','::1'].includes(host)||host.endsWith('.local')){
    throw new Error('owned_fabric_origin_must_be_public');
  }
  return url.origin;
}

export function assertVerifiedOwnedCanary(receipt){
  const required=[
    'verified',
    'public_https_verified',
    'identity_attestation_verified',
    'same_device_binding',
    'field_enrollment_verified',
    'mcp_initialize_verified',
    'mcp_tools_list_verified',
    'mcp_tool_calls_verified',
    'read_only_authority_verified',
  ];
  if(receipt?.schema!=='evercraft.public-edge.external-canary.v1') throw new Error('owned_fabric_canary_schema_invalid');
  if(receipt?.state!=='public_https_verified') throw new Error('owned_fabric_canary_state_invalid');
  for(const key of required){
    if(receipt?.[key]!==true) throw new Error('owned_fabric_canary_missing_'+key);
  }
  if(receipt?.external_saas_route_provider_required!==false){
    throw new Error('owned_fabric_canary_external_saas_boundary_invalid');
  }
  return receipt;
}

export function promoteOpenAiOwnedFabric({
  root=process.cwd(),
  receiptPath,
  originOverride='',
  dryRun=false,
}={}){
  if(!receiptPath) throw new Error('receipt_path_required');
  const absoluteReceipt=path.resolve(root,receiptPath);
  const rawReceipt=fs.readFileSync(absoluteReceipt,'utf8');
  const receipt=assertVerifiedOwnedCanary(JSON.parse(rawReceipt));
  const receiptOrigin=normalizeOwnedOrigin(receipt.origin);
  const origin=originOverride?normalizeOwnedOrigin(originOverride):receiptOrigin;
  if(origin!==receiptOrigin) throw new Error('owned_fabric_origin_receipt_mismatch');
  const mcpUrl=origin+'/mcp';
  const digest=sha256(rawReceipt);

  const portablePath=path.join(root,'plugins/evercraft-fabric/mcp.json');
  const compatPath=path.join(root,'plugins/evercraft-fabric/.mcp.json');
  const sourcePath=path.join(root,'plugins/evercraft-fabric/openai-submission.json');
  const distributionPath=path.join(root,'distribution/openai-plugin/submission.json');

  const portable=readJson(portablePath);
  portable.mcpServers.evercraft.url=mcpUrl;
  portable.mcpServers.evercraft.type='streamable-http';

  const compat=readJson(compatPath);
  compat.mcpServers.evercraft.url=mcpUrl;
  compat.mcpServers.evercraft.type='streamable-http';

  const source=readJson(sourcePath);
  const distribution=readJson(distributionPath);
  const observedPublic=distribution.existing_public_listing?.portal_observed_status==='Listed publicly';
  const originalMcpUrl=String(distribution.mcp?.url||'');
  const targetVersion=String(distribution.package_version||source.package_version||'unversioned');
  const previousPublicVersion=String(distribution.existing_public_listing?.portal_observed_version||'unconfirmed');
  if(observedPublic&&originalMcpUrl!==mcpUrl){
    throw new Error('existing_public_listing_origin_change_requires_manual_platform_review');
  }
  source.submission_state=observedPublic
    ?'existing_public_listing_update_prepared'
    :'owned_fabric_ready_provider_submission_required';
  source.compatibility_transport={
    ...(source.compatibility_transport||{}),
    mcp:null,
    authority:'retired_no_legacy_endpoint',
    active:false,
    owned_fabric_cutover_required:false,
  };
  source.owned_fabric_transport={
    ...(source.owned_fabric_transport||{}),
    mcp:mcpUrl,
    authority:'owned_public_fabric',
    verified_external_canary:true,
    external_canary_digest:digest,
    origin_change_requires_new_openai_plugin_submission:originalMcpUrl!==mcpUrl,
  };
  distribution.prepared_at=new Date().toISOString().slice(0,10);
  distribution.mcp={
    ...(distribution.mcp||{}),
    url:mcpUrl,
    url_type:'Universal',
    authority:'owned_public_fabric',
    owned_fabric_cutover_required:false,
    external_canary_digest:digest,
    origin_change_requires_new_plugin_submission:true,
  };
  if(observedPublic){
    distribution.release_notes=`Evercraft source release v${targetVersion} prepares an in-place update of the portal-observed public Evercraft v${previousPublicVersion} listing. Owned MCP unchanged; discovery remains read-only. No provider-side update is performed here.`;
    distribution.remaining_platform_prerequisites=[
      'Select the existing Evercraft LLC public plugin listing, not Create New',
      `Save current public version v${previousPublicVersion} metadata and verify the owned MCP origin`,
      `Upload or select the tested v${targetVersion} package through the provider update flow`,
      'Complete current scan, review, and any required approval/publish action',
      'Capture the provider version receipt and an independent clean-account install and invocation',
    ];
  }else{
    distribution.release_notes='Evercraft source package targets externally verified owned Fabric MCP; no public provider listing is confirmed by this source-only promotion.';
    distribution.remaining_platform_prerequisites=[
      'Confirm whether an existing public listing exists before creating any new submission',
      'Verify the owned MCP origin and complete current Platform scan/review',
      'Submit or update through the authenticated provider workflow as appropriate',
      'Record the published version and independently test directory discovery',
    ];
  }

  const promotionReceipt={
    schema:'evercraft.openai-owned-fabric-promotion.v1',
    promoted:true,
    origin,
    mcp_url:mcpUrl,
    external_canary_digest:digest,
    source_canary_state:receipt.state,
    source_device_fingerprint:receipt.device_fingerprint||null,
    source_public_edge_admission_receipt_ref:receipt.public_edge_admission_receipt_ref||null,
    legacy_mcp:null,
    legacy_transport_active:false,
    existing_public_listing_observed:observedPublic,
    prior_public_version:observedPublic?previousPublicVersion:null,
    prepared_source_version:targetVersion,
    requires_existing_listing_update:observedPublic,
    openai_origin_change_requires_new_plugin_submission:!observedPublic&&originalMcpUrl!==mcpUrl,
    provider_action_performed:false,
  };

  if(!dryRun){
    writeJson(portablePath,portable);
    writeJson(compatPath,compat);
    writeJson(sourcePath,source);
    writeJson(distributionPath,distribution);
    const outPath=path.join(root,'artifacts/openai-owned-fabric-promotion-receipt.json');
    fs.mkdirSync(path.dirname(outPath),{recursive:true});
    writeJson(outPath,promotionReceipt);
  }
  return promotionReceipt;
}

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0?String(process.argv[i+1]||''):fallback;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const receipt=promoteOpenAiOwnedFabric({
    receiptPath:arg('--receipt'),
    originOverride:arg('--origin',''),
    dryRun:process.argv.includes('--dry-run'),
  });
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
