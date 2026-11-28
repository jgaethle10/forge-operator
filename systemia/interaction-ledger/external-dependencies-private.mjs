// Owner-private bridge for the existing Kaidance heartbeat. No mailbox access,
// no dispatch, no new scheduler, and no public projection of private counts.
import fs from 'node:fs';
import path from 'node:path';
import {projectExternalDependencies} from './external-dependencies.mjs';
const MAX_BYTES=2_000_000, MAX_ROWS=10000;
const held=status=>({status,coverage_verified:false,execution_authorized:false,publication_authorized:false});
function privateStat(p,dir){
 const s=fs.lstatSync(p);
 if(s.isSymbolicLink()||(dir?!s.isDirectory():!s.isFile())||
  typeof process.getuid!=='function'||s.uid!==process.getuid()||(s.mode&0o077)!==0||
  (!dir&&s.nlink!==1))throw Error('private_path_required');
 return s;
}
function readPrivateExport(file){
 privateStat(file,false);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const s=fs.fstatSync(fd);
  if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)||s.size>MAX_BYTES)
   throw Error('unsafe_export');
  const b=fs.readFileSync(fd);
  const after=fs.fstatSync(fd);
  if(b.length!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)
   throw Error('export_changed');
  return JSON.parse(b.toString('utf8'));
 }finally{fs.closeSync(fd)}
}
export function reconcileDependencyExport(value,now=new Date()){
 const at=new Date(now),age=+at-Date.parse(value?.exported_at);
 if(!Number.isFinite(age)||age<0||age>900000)return held('stale_or_missing_export');
 if(value.schema!=='evercraft.crm.external-dependencies-export.v1'||
  value.scope!=='authorized_external_dependencies'||
  !['complete','partial'].includes(value.coverage)||
  ![value.requests,value.receipts,value.reviewed_continuation_ids].every(a=>Array.isArray(a)&&a.length<=MAX_ROWS))
  return held('invalid_export');
 try{
  const projection=projectExternalDependencies({requests:value.requests,receipts:value.receipts,
   reviewedContinuationIds:value.reviewed_continuation_ids,now:at.toISOString()});
  return {...held('private_review_ready'),source_coverage:value.coverage,
   source_authority:'owner_export_reported_not_independently_verified',projection};
 }catch{return held('invalid_or_conflicting_records')}
}
// Explicitly enabled, same private sibling layout as kaidance-rd-continuity.
// Caller must keep the returned detailed object private. Only status may enter
// a broader heartbeat or public-facing path; no private record writes here.
export function readPrivateDependencyReview({enabled=false,root,outDir,now=new Date()}={}){
 if(!enabled)return held('not_configured');
 try{
  const repo=fs.realpathSync(root),parent=path.dirname(path.resolve(outDir));
  if(fs.realpathSync(parent)!==parent)throw Error('unsafe_parent');
  const dir=path.join(parent,'kaidance-crm-dependencies');
  if(dir===repo||dir.startsWith(repo+path.sep)||dir===path.resolve(outDir))throw Error('unsafe_directory');
  privateStat(parent,true);privateStat(dir,true);
  if(fs.realpathSync(dir)!==dir)throw Error('unsafe_directory');
  return reconcileDependencyExport(readPrivateExport(path.join(dir,'request-export.json')),now);
 }catch{return held('private_export_unavailable')}
}
export function dependencyHeartbeatStatus(result){
 return {status:result?.status==='private_review_ready'?'private_review_ready':
  result?.status==='not_configured'?'not_configured':'held',
  execution_authorized:false,publication_authorized:false};
}
