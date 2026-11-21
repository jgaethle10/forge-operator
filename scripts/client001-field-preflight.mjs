#!/usr/bin/env node
// Read-only Client 001 physical-node inspection. Does NOT stage files,
// activate routes, change Caddy, DNS, device trust, or system services.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCE=new URL('../public/clients/on-the-go/review/index.html',import.meta.url);
const ROOT='/srv/evercraft/client001/releases';

export function firstSymlinkAncestor(file,io=fs){
 let current=path.parse(path.resolve(file)).root;
 const rest=path.resolve(file).slice(current.length).split(path.sep).filter(Boolean);
 for(const part of rest){
  current=path.join(current,part);
  try{
   if(io.lstatSync(current).isSymbolicLink())return true;
  }catch(e){if(e.code==='ENOENT')return false;throw e;}
 }
 return false;
}
export function inspectSourceStage({sourcePath=SOURCE,releaseRoot=ROOT,io=fs}={}){
 const evidence={source_present:false,canonical_sha256:null,
  releases_root_exists:false,release_staged:false,staged_sha256_matches:false,
  current_pointer_exists:false,current_pointer_owned:false,
  symlink_ancestor_found:false,immutable_release_violation:false};
 let source;
 try{source=io.readFileSync(sourcePath);evidence.source_present=true;
  evidence.canonical_sha256=sha(source);
 }catch(e){if(e.code!=='ENOENT')throw e;}
 evidence.symlink_ancestor_found=firstSymlinkAncestor(releaseRoot,io);
 try{
  const stat=io.lstatSync(releaseRoot);
  evidence.releases_root_exists=stat.isDirectory()&&!stat.isSymbolicLink();
 }catch(e){if(e.code!=='ENOENT')throw e;}
 if(evidence.source_present && evidence.releases_root_exists && !evidence.symlink_ancestor_found){
  const release=path.join(releaseRoot,evidence.canonical_sha256);
  try{
   const stat=io.lstatSync(release);
   if(!stat.isDirectory()||stat.isSymbolicLink()){
    evidence.immutable_release_violation=true;
   }else{
    const html=path.join(release,'index.html');
    const htmlStat=io.lstatSync(html);
    if(!htmlStat.isFile()||htmlStat.isSymbolicLink()){
     evidence.immutable_release_violation=true;
    }else{
     evidence.release_staged=true;
     evidence.staged_sha256_matches=sha(io.readFileSync(html))===evidence.canonical_sha256;
     evidence.immutable_release_violation=!evidence.staged_sha256_matches;
    }
   }
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const current=path.join(path.dirname(releaseRoot),'current');
 try{
  const st=io.lstatSync(current);
  evidence.current_pointer_exists=true;
  if(st.isSymbolicLink()&&!evidence.symlink_ancestor_found){
   const target=io.realpathSync(current);
   // Only a version directory under the same dedicated releases root may be a known target.
   evidence.current_pointer_owned=target.startsWith(path.resolve(releaseRoot)+path.sep)&&
    /^[a-f0-9]{64}$/.test(path.basename(target));
  }
 }catch(e){if(e.code!=='ENOENT')throw e;}
 return evidence;
}
export function admission(evidence,{caddyStatus='unknown',fabricStatus='unknown'}={}){
 const holds=[];
 if(!evidence.source_present)holds.push('canonical_source_missing');
 if(evidence.symlink_ancestor_found)holds.push('symlinked_release_tree');
 if(!evidence.releases_root_exists)holds.push('release_root_missing');
 if(!evidence.release_staged)holds.push('canonical_release_not_staged_on_this_node');
 if(evidence.immutable_release_violation)holds.push('staged_release_tamper_or_symlink');
 if(evidence.release_staged&&!evidence.staged_sha256_matches)holds.push('staged_source_digest_mismatch');
 if(evidence.current_pointer_exists&&!evidence.current_pointer_owned)holds.push('current_pointer_unrecognized');
 // The following holds require *independent* evidence. Read-only local inspection cannot satisfy them.
 holds.push('juan_publication_approval_unverified','registered_public_domain_unverified',
  'authorized_public_dns_control_unverified','owned_public_ingress_and_tls_unverified',
  'external_browser_and_uptime_unverified','rollback_and_recovery_unverified');
 return {schema:'evercraft.client001.physical-edge-preflight.v1',
  status:'HOLD_PUBLIC_PROMOTION',scope:'local_node_read_only',
  canonical_source_sha256:evidence.canonical_sha256,
  source_present:evidence.source_present,
  release_staged:evidence.release_staged,
  staged_digest_verified:evidence.staged_sha256_matches,
  current_pointer_present:evidence.current_pointer_exists,
  current_pointer_owned:evidence.current_pointer_owned,
  release_tree_symlinked:evidence.symlink_ancestor_found,
  existing_caddy_service:caddyStatus,
  existing_fabric_service:fabricStatus,
  no_network_writes:true,
  no_filesystem_writes:true,
  public_deploy_performed:false,
  public_dns_changed:false,
  customer_release_authorized:false,
  blockers:[...new Set(holds)]};
}
function serviceState(service){
 try{
  const v=execFileSync('systemctl',['is-active',service],{encoding:'utf8',
   stdio:['ignore','pipe','ignore'],timeout:2500}).trim();
  return v==='active'?'active':'not_active';
 }catch(e){
  const known=String(e.stdout||'').trim();
  if(['inactive','failed','activating','deactivating','unknown'].includes(known))return 'not_active';
  return 'unknown';
 }
}
if(process.argv[1]&&import.meta.url===new URL('file:'+path.resolve(process.argv[1])).href){
 if(process.argv.length>2)throw new Error('usage: node scripts/client001-field-preflight.mjs (no arguments, read-only)');
 const output=admission(inspectSourceStage(),{
  caddyStatus:serviceState('caddy'),
  fabricStatus:serviceState('evercraft-fabric')
 });
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
}
