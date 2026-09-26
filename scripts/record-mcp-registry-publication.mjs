#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

const root=process.cwd();
const manifestsFile=path.resolve(arg('--manifests-file','/tmp/published-manifests.txt'));
const specPath=path.resolve(arg('--spec','distribution/direct-plugin-specs.json'));
const receiptDir=path.resolve(arg('--receipt-dir','distribution/mcp-registry-publication-receipts'));
const workflowRunId=String(arg('--workflow-run-id',process.env.GITHUB_RUN_ID||'')).trim();
const releaseSha=String(arg('--release-sha',process.env.GITHUB_SHA||'')).trim();
const approvalMode=String(arg('--approval-mode','')).trim();
const approvalRef=String(arg('--approval-ref','')).trim();

if(!fs.existsSync(manifestsFile)) throw new Error('published_manifests_file_missing');
if(!fs.existsSync(specPath)) throw new Error('direct_plugin_specs_missing');
if(!workflowRunId) throw new Error('workflow_run_id_required');
if(!/^[a-f0-9]{40}$/i.test(releaseSha)) throw new Error('release_sha_invalid');

const TARGETS=new Map([
  ['ibmi-rescue','io.github.jgaethle10/ibmi-rescue'],
  ['foundry-app-escape','io.github.jgaethle10/foundry-app-escape'],
  ['site-survive','io.github.jgaethle10/site-survive'],
]);

const manifests=fs.readFileSync(manifestsFile,'utf8')
  .split('\n')
  .map(x=>x.trim())
  .filter(Boolean);

const specs=JSON.parse(fs.readFileSync(specPath,'utf8'));
const recorded=[];

for(const manifestPath of manifests){
  if(!/^mcp-registry\/[^/]+\.json$/.test(manifestPath)) continue;
  const slug=path.basename(manifestPath,'.json');
  const desiredName=TARGETS.get(slug);
  if(!desiredName) continue;

  const abs=path.resolve(root,manifestPath);
  if(!fs.existsSync(abs)) throw new Error('published_manifest_missing:'+slug);
  const manifest=JSON.parse(fs.readFileSync(abs,'utf8'));
  const product=(specs.products||[]).find(p=>p.slug===slug);
  if(!product) throw new Error('direct_product_missing:'+slug);

  if(manifest.name!==desiredName) throw new Error('published_manifest_name_mismatch:'+slug);
  if(product.mcp_url!==manifest?.remotes?.[0]?.url){
    throw new Error('published_manifest_remote_mismatch:'+slug);
  }
  if(product.state!=='public_https_verified_registry_pending' &&
     product.state!=='registry_published_direct_mcp_existing'){
    throw new Error('direct_product_not_publicly_verified:'+slug);
  }
  if(product.public_edge_canary?.verified!==true){
    throw new Error('public_edge_canary_missing_for_registry_publication:'+slug);
  }

  product.state='registry_published_direct_mcp_existing';
  product.registry_name=desiredName;
  product.public_origin_state='external_canary_verified';
  product.public_edge_canary={
    ...product.public_edge_canary,
    registry_publication_proven:true,
  };
  product.registry_publication_receipt={
    schema:'evercraft.mcp-registry.publication-receipt.v1',
    registry_name:desiredName,
    version:String(manifest.version||''),
    manifest:manifestPath,
    remote_mcp:manifest.remotes[0].url,
    publisher:'official_mcp_registry',
    publisher_outcome:'publisher_command_succeeded_or_duplicate_version_confirmed',
    workflow_run_id:workflowRunId,
    release_sha:releaseSha,
    approval_mode:approvalMode||null,
    approval_ref:approvalRef||null,
    recorded_at:new Date().toISOString(),
  };

  fs.mkdirSync(receiptDir,{recursive:true});
  const receiptPath=path.join(
    receiptDir,
    slug+'-'+String(manifest.version||'unknown')+'.json'
  );
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(product.registry_publication_receipt,null,2)+'\n'
  );
  recorded.push({
    slug,
    registry_name:desiredName,
    version:String(manifest.version||''),
    manifest:manifestPath,
    receipt:path.relative(root,receiptPath),
  });
}

if(recorded.length){
  fs.writeFileSync(specPath,JSON.stringify(specs,null,2)+'\n');
}

console.log(JSON.stringify({
  schema:'evercraft.mcp-registry.publication-recording.v1',
  recorded,
  publication_state_changed:recorded.length>0,
  workflow_run_id:workflowRunId,
  release_sha:releaseSha,
},null,2));
