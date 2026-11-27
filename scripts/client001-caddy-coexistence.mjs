#!/usr/bin/env node
// Client 001 + existing owned Caddy coexistence REHEARSAL ONLY.
// Reads existing live config and already-staged release; never reloads Caddy,
// changes the live config, activates /current, edits DNS or installs trust.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectSourceStage} from './client001-field-preflight.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fragmentFile=path.join(root,'infra/evercraft-edge/client001-on-the-go/Caddyfile.example');
const defaultBase='/etc/evercraft/Caddyfile';
const defaultEnv='/etc/evercraft/public-edge.env';
export const syntheticHost='onthegoquicklube.invalid';

export function sha256(value){
 return crypto.createHash('sha256').update(value).digest('hex');
}
export function composeCandidate(base,fragment){
 if(!base||!fragment)throw Error('missing_caddyfile_source');
 if(base.includes('{$CLIENT001_DOMAIN}')||/\b(?:client001|onthegoquicklube)\b/i.test(base))
  throw Error('existing_client001_routing_requires_manual_reconciliation');
 if(!fragment.includes('{$CLIENT001_DOMAIN}, www.{$CLIENT001_DOMAIN} {'))
  throw Error('candidate_missing_exact_host_guard');
 if(/(^|\n)\s*(?:tls\s+internal|reverse_proxy)\b/m.test(fragment))
  throw Error('candidate_must_remain_static_public_ca');
 // Original config is a byte-identical prefix. Never rewrite its globals
 // or other tenants' existing route definitions for a new customer.
 return base+(base.endsWith('\n')?'':'\n')+
  '\n# Client 001 READ-ONLY REHEARSAL (synthetic .invalid only; NEVER deploy this file)\n'+
  fragment.replace(/\s+$/,'')+'\n';
}
export function readScopedEdgeEnv(text){
 const out={};
 // No evaluation, shell sourcing, interpolation, command expansion or logging.
 for(const line of text.split(/\r?\n/)){
  if(!line||/^\s*#/.test(line))continue;
  const match=/^(EVERCRAFT_PUBLIC_HOST|EVERCRAFT_ACME_EMAIL)=([^\r\n]*)$/.exec(line);
  if(match)out[match[1]]=match[2];
 }
 if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(out.EVERCRAFT_PUBLIC_HOST||'') ||
    !(out.EVERCRAFT_PUBLIC_HOST||'').includes('.'))
  throw Error('edge_host_env_missing_or_invalid');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.EVERCRAFT_ACME_EMAIL||''))
  throw Error('edge_acme_env_missing_or_invalid');
 return out;
}
export function hostnameRoutes(json){
 const names=new Set();
 const walk=v=>{
  if(!v||typeof v!=='object')return;
  if(Array.isArray(v)){for(const x of v)walk(x);return;}
  if(v.host&&Array.isArray(v.host))for(const h of v.host)
   if(typeof h==='string')names.add(h.toLowerCase());
  for(const [k,x] of Object.entries(v))if(k!=='host')walk(x);
 };
 walk(json.apps?.http?.servers||{});
 return [...names].sort();
}
export function assertCoexistence(before,after,{fabricHost,clientHost=syntheticHost}={}){
 const beforeNames=hostnameRoutes(before);
 const afterNames=hostnameRoutes(after);
 if(!beforeNames.includes(fabricHost.toLowerCase()))
  throw Error('original_fabric_host_not_found');
 if(beforeNames.includes(clientHost)||beforeNames.includes('www.'+clientHost))
  throw Error('client_host_conflicts_with_existing_edge');
 for(const n of beforeNames)if(!afterNames.includes(n))
  throw Error('existing_hostname_removed:'+n);
 if(!afterNames.includes(clientHost)||!afterNames.includes('www.'+clientHost))
  throw Error('synthetic_client_host_missing');
 // Every prior host-matched route (including its handler chain) must still
 // occur unchanged as a subtree after parsing the candidate.
 const normalize=x=>JSON.stringify(x);
 const routeSet=config=>{
  const out=[];
  const walk=v=>{
   if(!v||typeof v!=='object')return;
   if(Array.isArray(v)){for(const x of v)walk(x);return;}
   if(Array.isArray(v.match)&&v.match.some(m=>Array.isArray(m.host))){
    out.push(normalize({match:v.match,handle:v.handle,terminal:v.terminal}));
   }
   for(const x of Object.values(v))walk(x);
  };walk(config.apps?.http?.servers||{});return out;
 };
 const prior=routeSet(before),next=routeSet(after);
 for(const route of prior)if(!next.includes(route))
  throw Error('existing_host_route_changed');
 return {original_host_route_count:prior.length,original_host_routes_preserved:true,
  original_hosts:beforeNames,added_hosts:afterNames.filter(x=>!beforeNames.includes(x))};
}
function adapt(candidate,env){
 // caddy adapt is a parser only: stdin, no Caddy process and no disk output.
 const result=spawnSync('/usr/bin/caddy',
  ['adapt','--config','/dev/stdin','--adapter','caddyfile'],
  {input:candidate,encoding:'utf8',timeout:12000,maxBuffer:5*1024*1024,
   env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
 if(result.error||result.status!==0)throw Error('read_only_caddy_adapter_failed');
 try{return JSON.parse(result.stdout)}catch{throw Error('adapter_did_not_return_json')}
}
export function evaluatePhysicalEdge({
 base=defaultBase,edgeEnv=defaultEnv,io=fs,adapter=adapt,
 baseContent=null,stageInspector=inspectSourceStage
}={}){
 const evidence={schema:'evercraft.client001.caddy-coexistence-rehearsal.v1',
  state:'HOLD_PUBLIC_PROMOTION',source:'physical_penguin_read_only',
  original_config_sha256:null,synthetic_composite_sha256:null,
  original_bytes_preserved:false,existing_routes_preserved:false,
  synthetic_client_host:syntheticHost,real_domain_tested:false,
  production_config_modified:false,service_reloaded:false,
  current_pointer_modified:false,dns_modified:false,
  client001_publicly_deployed:false,
  blocked_by:['juan_approval','real_public_domain_and_dns_authority',
   'actual_customer_host_acme_validation','independent_external_client001_browser',
   'authorized_reversible_promotion']};
 try{
  // Allow a single read-only stream from the Caddy service account. Never
  // weaken /etc/evercraft permissions or execute repo-owned JS as root/caddy.
  // The protected Caddyfile is held only in process memory and never printed.
  const existing=baseContent===null?io.readFileSync(base,'utf8'):baseContent;
  if(typeof existing!=='string'||existing.length===0||
      Buffer.byteLength(existing,'utf8')>2*1024*1024||existing.includes('\0'))
   throw Error('invalid_protected_caddyfile_input');
  const fragment=io.readFileSync(fragmentFile,'utf8');
  const scoped=readScopedEdgeEnv(io.readFileSync(edgeEnv,'utf8'));
  const stage=stageInspector();
  evidence.canonical_source_sha256=stage.canonical_sha256;
  evidence.staged_digest_verified=stage.staged_sha256_matches;
  if(!stage.release_staged||!stage.staged_sha256_matches)
   throw Error('physical_client001_release_not_verified');
  const composite=composeCandidate(existing,fragment);
  evidence.original_config_sha256=sha256(existing);
  evidence.synthetic_composite_sha256=sha256(composite);
  evidence.original_bytes_preserved=composite.startsWith(existing);
  const env={...scoped,CLIENT001_DOMAIN:syntheticHost};
  const originalAdapted=adapter(existing,env),joinedAdapted=adapter(composite,env);
  const compare=assertCoexistence(originalAdapted,joinedAdapted,
   {fabricHost:scoped.EVERCRAFT_PUBLIC_HOST});
  evidence.existing_routes_preserved=compare.original_host_routes_preserved;
  evidence.original_host_route_count=compare.original_host_route_count;
  evidence.synthetic_hosts_present=compare.added_hosts.includes(syntheticHost)&&
   compare.added_hosts.includes('www.'+syntheticHost);
  if(!evidence.synthetic_hosts_present)throw Error('synthetic_client_aliases_missing');
  evidence.result='PASS_SOURCE_COMPOSITION_ONLY';
 }catch(e){
  evidence.result='HOLD_REHEARSAL_INCOMPLETE';
  evidence.reason=String(e.message).slice(0,160).replaceAll(/\S+[/\\]\S+/g,'[redacted-path]');
 }
 return evidence;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&args[0]!=='--base-stdin'))
  throw Error('Usage: node scripts/client001-caddy-coexistence.mjs [--base-stdin] (read-only)');
 // --base-stdin is for: sudo -u caddy cat /etc/evercraft/Caddyfile |
 //   node scripts/client001-caddy-coexistence.mjs --base-stdin
 // Never run a user-writable repository script via sudo.
 const result=evaluatePhysicalEdge(args.length===1?
  {baseContent:fs.readFileSync(0,'utf8')}:{});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.result!=='PASS_SOURCE_COMPOSITION_ONLY')process.exitCode=1;
}
