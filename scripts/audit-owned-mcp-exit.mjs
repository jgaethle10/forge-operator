#!/usr/bin/env node
// Evercraft machine-connector Base44 exit audit and enforceable install-door gate.
// History/archival manifests are identified but not silently rewritten or installed.
// No secret, customer record, domain write, checkout, payment or provider publication.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const OWNED_UNIVERSAL='https://fabric.systemiacommandcenters.com/mcp';
export const INSTALL_MANIFESTS=[
  'grok/evercraft/.mcp.json',
  'plugins/evercraft-ai-suite/mcp.json'
];
export const INSTALL_GUIDES=[
  'AI-CONNECT.md',
  'grok/evercraft/INSTALL.md',
  'grok/evercraft/README.md',
  'plugins/evercraft-ai-suite/README.md'
];
const legacyHost=/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*base44\.app(?:\/|(?=["'\s]|$))/i;
function isLegacy(value){
 try{
  const url=new URL(value);
  return url.hostname==='base44.app'||url.hostname.endsWith('.base44.app');
 }catch{return true;}
}
export function validateActiveInstallDoors({
 root='.',manifests=INSTALL_MANIFESTS,guides=INSTALL_GUIDES
}={}){
 const failures=[],checked=[];
 for(const file of manifests){
  const full=path.join(root,file);
  if(!existsSync(full)){failures.push({file,issue:'missing_active_connector_manifest'});continue}
  let parsed;
  try{parsed=JSON.parse(readFileSync(full,'utf8'))}
  catch{failures.push({file,issue:'invalid_connector_json'});continue}
  const connections=Object.values(parsed.mcpServers||{});
  if(!connections.length){failures.push({file,issue:'no_mcp_connection'});continue}
  for(const connection of connections){
   if(connection.url!==OWNED_UNIVERSAL||isLegacy(connection.url||'')){
    failures.push({file,issue:'not_exact_owned_universal_mcp'});
   }
  }
  checked.push({file,kind:'active_install',connections:connections.length});
 }
 for(const file of guides){
  const full=path.join(root,file);
  if(!existsSync(full)){failures.push({file,issue:'missing_active_install_guide'});continue}
  const contents=readFileSync(full,'utf8');
  if(!contents.includes(OWNED_UNIVERSAL))failures.push({file,issue:'owned_connection_not_documented'});
  if(legacyHost.test(contents))failures.push({file,issue:'legacy_host_advertised_in_install_guide'});
  checked.push({file,kind:'public_install_guidance'});
 }
 return {
  schema:'evercraft.systemia.owned-ai-install-doors.v1',
  state:failures.length?'BLOCKED':'OWNED_INSTALL_DOORS_PASS',
  checked,failures,
  internal_owned_mcp_only:true,
  registry_directory_repoint_proven:false,
  paid_provider_verified:false
 };
}
export function inventoryRegistryDebt({root='.'}={}){
 const dir=path.join(root,'mcp-registry');
 if(!existsSync(dir))return {manifest_count:0,legacy_manifest_count:0,legacy:[],source_missing:true};
 const files=readdirSync(dir).filter(x=>x.endsWith('.json')).sort();
 const legacy=[];
 for(const filename of files){
  const file='mcp-registry/'+filename;
  let data;
  try{data=JSON.parse(readFileSync(path.join(dir,filename),'utf8'))}
  catch{legacy.push({file,reason:'manifest_unreadable'});continue}
  const endpoints=[data.websiteUrl,...(data.remotes||[]).map(r=>r?.url)].filter(x=>typeof x==='string');
  if(endpoints.some(isLegacy))legacy.push({file,reason:'unrepointed_provider_mcp_or_web_url',
   registry_name:String(data.name||'').slice(0,160)});
 }
 return {
  manifest_count:files.length,
  legacy_manifest_count:legacy.length,
  legacy,
  source_missing:false,
  caveat:'Registry JSON is source/config evidence, not live provider-listing readback. Never substitute the owned universal URL for a specialist without exact tool parity.'
 };
}
export function checkPublication({root='.',manifest}={}){
 if(!manifest||!manifest.endsWith('.json'))return {state:'BLOCKED',reason:'manifest_path_required'};
 const allowed=['mcp/evercraft-web/server.json',...readdirSync(path.join(root,'mcp-registry')).filter(x=>x.endsWith('.json')).map(x=>'mcp-registry/'+x)];
 if(!allowed.includes(manifest))return {state:'BLOCKED',reason:'publication_manifest_not_allowlisted'};
 let data;
 try{data=JSON.parse(readFileSync(path.join(root,manifest),'utf8'))}
 catch{return {state:'BLOCKED',reason:'publication_manifest_unreadable'}}
 const remotes=(data.remotes||[]).map(x=>x?.url);
 if(!remotes.length||remotes.some(x=>typeof x!=='string'||isLegacy(x)))
  return {state:'BLOCKED',reason:'publication_target_missing_or_legacy',manifest};
 const websites=[data.websiteUrl].filter(Boolean);
 if(websites.some(isLegacy))return {state:'BLOCKED',reason:'publication_home_is_legacy',manifest};
 if(remotes.some(x=>new URL(x).protocol!=='https:'))
  return {state:'BLOCKED',reason:'publication_https_required',manifest};
 return {
  state:'ROUTE_SOURCE_ONLY_PASS',
  manifest,
  verified_tool_contract:false,
  registry_repointed:false,
  independent_live_endpoint_check_required:true,
  actual_publication_authorized:false
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args[0]==='--publication'){
  const result=checkPublication({manifest:args[1]});
  console.log(JSON.stringify(result,null,2));
  if(result.state!=='ROUTE_SOURCE_ONLY_PASS')process.exitCode=2;
 }else{
  const install=validateActiveInstallDoors();
  const registry=inventoryRegistryDebt();
  const report={
   schema:'evercraft.systemia.portfolio-mcp-provider-exit-audit.v1',
   observed_at_utc:new Date().toISOString(),
   install,registry,
   whole_portfolio_migrated:false,
   production_provider_connectors_repointed:'NOT_PROVEN',
   external_directory_repointed:'NOT_PROVEN',
   decommission_authorized:false
  };
  console.log(JSON.stringify(report,null,2));
  if(install.state!=='OWNED_INSTALL_DOORS_PASS')process.exitCode=1;
 }
}
