#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const DEFAULT_CONFIG='governance/rivet-hosting-migration/baseline.json';

function sha256(value){
  const body=Buffer.isBuffer(value)?value:Buffer.from(value);
  return 'sha256:'+createHash('sha256').update(body).digest('hex');
}

function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function cleanOrigin(value){
  const raw=String(value||'').trim().replace(/\/+$/,'');
  if(!raw) return null;
  const url=new URL(raw);
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!loopback){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target origin must use HTTPS');
  }
  if(url.pathname!=='/'&&url.pathname!==''){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target origin must not contain a path');
  }
  return url.origin;
}

function validateBrandManifest(manifest,baseline){
  const expected=baseline.brand_contract;
  const failures=[];
  if(manifest.canonical_name!==expected.canonical_name) failures.push('canonical_name');
  if(manifest.source_of_truth?.document!==expected.source_document) failures.push('source_document');
  if(manifest.source_of_truth?.version!==expected.version) failures.push('source_version');
  if(manifest.typography?.headings!==expected.typography.headings) failures.push('heading_typography');
  if(manifest.typography?.body!==expected.typography.body) failures.push('body_typography');
  if(manifest.theme?.default!==expected.theme.default) failures.push('default_theme');
  if(manifest.theme?.dark_mode!==expected.theme.dark_mode) failures.push('dark_mode');
  for(const [key,value] of Object.entries(expected.palette||{})){
    if(manifest.palette?.[key]!==value) failures.push('palette:'+key);
  }
  if(JSON.stringify(manifest.process)!==JSON.stringify(expected.process)) failures.push('process');
  return failures;
}

function localBaseline(config){
  const root=config.local_root;
  const assets={};
  for(const name of config.exact_runtime_assets){
    const file=path.join(root,name);
    if(!fs.existsSync(file)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: missing local approved asset '+file);
    const body=fs.readFileSync(file);
    assets[name]={bytes:body.length,sha256:sha256(body)};
  }
  const manifest=readJson(path.join(root,'brand.json'));
  const manifestFailures=validateBrandManifest(manifest,config);
  if(manifestFailures.length){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: local brand manifest drift '+manifestFailures.join(','));
  }
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const required of config.page_contract.required_text){
    if(!index.includes(required)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: local page missing required text '+required);
  }
  for(const required of config.page_contract.required_refs){
    if(!index.includes(required)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: local page missing required asset reference '+required);
  }
  if(!index.includes('<title>'+config.page_contract.title+'</title>')){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: local title drift');
  }
  for(const pattern of config.page_contract.forbidden_patterns){
    if(new RegExp(pattern,'i').test(index)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: local forbidden pattern '+pattern);
  }
  return {assets,manifest,index_sha256:sha256(index)};
}

async function fetchStrict(origin,requestPath){
  const response=await fetch(origin+requestPath,{redirect:'follow',headers:{'user-agent':'Evercraft-RIVET-Hosting-Migration-Audit/1.0'}});
  if(!response.ok) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: HTTP '+response.status+' '+requestPath);
  const final=new URL(response.url);
  const expected=new URL(origin);
  if(final.origin!==expected.origin){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: cross-origin redirect '+requestPath+' -> '+final.origin);
  }
  return {response,body:Buffer.from(await response.arrayBuffer())};
}

export async function auditRivetHostingMigration({
  configPath=DEFAULT_CONFIG,
  targetOrigin=null
}={}){
  const config=readJson(configPath);
  if(config.approval_state!=='planning_only_no_migration_authority'){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: unexpected migration authority state');
  }
  const local=localBaseline(config);
  const receipt={
    schema:'evercraft.rivet.hosting-migration-audit-receipt.v1',
    approval_state:config.approval_state,
    migration_authority_granted:false,
    baseline_commit:config.captured_from_commit,
    local:{
      brand_contract_verified:true,
      page_contract_verified:true,
      assets:Object.fromEntries(Object.entries(local.assets).map(([k,v])=>[k,{bytes:v.bytes,sha256:v.sha256}])),
      index_sha256:local.index_sha256
    },
    target:null,
    verified_at:new Date().toISOString()
  };

  const origin=cleanOrigin(targetOrigin);
  if(!origin) return receipt;

  const base=config.public_base_path.replace(/\/$/,'');
  const [remoteBrand,remoteCss,remoteIndex]=await Promise.all([
    fetchStrict(origin,base+'/brand.json'),
    fetchStrict(origin,base+'/brand.css'),
    fetchStrict(origin,base+'/')
  ]);

  const remoteAssets={
    'brand.json':{bytes:remoteBrand.body.length,sha256:sha256(remoteBrand.body)},
    'brand.css':{bytes:remoteCss.body.length,sha256:sha256(remoteCss.body)}
  };
  for(const name of config.exact_runtime_assets){
    if(remoteAssets[name].sha256!==local.assets[name].sha256){
      throw new Error('RIVET_MIGRATION_AUDIT_FAIL: exact approved asset drift '+name);
    }
  }

  const manifest=JSON.parse(remoteBrand.body.toString('utf8'));
  const manifestFailures=validateBrandManifest(manifest,config);
  if(manifestFailures.length){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target brand manifest drift '+manifestFailures.join(','));
  }

  const html=remoteIndex.body.toString('utf8');
  if(!html.includes('<title>'+config.page_contract.title+'</title>')){
    throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target title drift');
  }
  for(const required of config.page_contract.required_text){
    if(!html.includes(required)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target missing required text '+required);
  }
  for(const required of config.page_contract.required_refs){
    if(!html.includes(required)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target missing required asset reference '+required);
  }
  for(const pattern of config.page_contract.forbidden_patterns){
    if(new RegExp(pattern,'i').test(html)) throw new Error('RIVET_MIGRATION_AUDIT_FAIL: target forbidden pattern '+pattern);
  }

  receipt.target={
    origin,
    public_base_path:config.public_base_path,
    brand_assets_exact:true,
    brand_manifest_verified:true,
    page_contract_verified:true,
    assets:remoteAssets,
    index_sha256:sha256(remoteIndex.body),
    zero_brand_drift_gate:'pass',
    note:'This audit proves exact core brand assets and structural page contract. Pixel-level visual approval remains a separate pre-cutover gate.'
  };
  return receipt;
}

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--config') out.configPath=argv[++i];
    else if(argv[i]==='--origin') out.targetOrigin=argv[++i];
  }
  return out;
}

const isCli=fileURLToPath(import.meta.url)===path.resolve(process.argv[1]||'');
if(isCli){
  auditRivetHostingMigration(parseArgs(process.argv.slice(2)))
    .then((receipt)=>process.stdout.write(JSON.stringify(receipt,null,2)+'\n'))
    .catch((error)=>{
      process.stderr.write(JSON.stringify({ok:false,error:String(error?.message||error)},null,2)+'\n');
      process.exitCode=1;
    });
}
