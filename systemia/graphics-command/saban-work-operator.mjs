// Offline Saban Graphics operator intake. Explicit directory scope, OS file permissions,
// and a single local read. No service connections, no authentication claim, no publication.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSabanWorkProof} from './saban-work-visual.mjs';

const MAX_BYTES=8*1024*1024;
const PUBLIC_ROOT=path.resolve(fileURLToPath(new URL('../../public/',import.meta.url)));
const within=(root,candidate)=>{
  const rel=path.relative(root,candidate);
  return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);
};
const isPublic=candidate=>candidate===PUBLIC_ROOT||within(PUBLIC_ROOT,candidate);
const assertAbsolute=(name,value)=>{
  if(typeof value!=='string'||!path.isAbsolute(value))throw new Error(name+' must be an absolute path');
  return path.resolve(value);
};
const assertScopedRoot=(name,input)=>{
  const resolved=assertAbsolute(name,input);
  const real=fs.realpathSync(resolved);
  if(real===path.parse(real).root||isPublic(real))throw new Error(name+' cannot be filesystem or published public root');
  if(real!==resolved)throw new Error(name+' must not be a symlink');
  if(!fs.statSync(real).isDirectory())throw new Error(name+' is not a directory');
  return real;
};
const readScopedFile=(root,input)=>{
  const target=assertAbsolute('Snapshot',input);
  if(!within(root,target))throw new Error('Snapshot is outside authorized source root');
  const real=fs.realpathSync(target);
  if(!within(root,real)||real!==target)throw new Error('Snapshot symlink or root escape rejected');
  const lstat=fs.lstatSync(target);
  if(!lstat.isFile()||lstat.isSymbolicLink())throw new Error('Snapshot must be a regular file');
  if(lstat.size>MAX_BYTES)throw new Error('Snapshot exceeds 8 MiB');
  const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|(fs.constants.O_NONBLOCK??0);
  const fd=fs.openSync(target,flags);
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size>MAX_BYTES||stat.ino!==lstat.ino||stat.dev!==lstat.dev)
      throw new Error('Snapshot changed or is not a regular file');
    const raw=fs.readFileSync(fd,'utf8');
    if(Buffer.byteLength(raw)>MAX_BYTES)throw new Error('Snapshot exceeds 8 MiB');
    return raw;
  }finally{fs.closeSync(fd);}
};
export function classifySnapshotClock(snapshotAt,{now=Date.now(),staleAfterMinutes=15}={}){
  const snapshot=Date.parse(snapshotAt);
  if(!Number.isFinite(snapshot)||!Number.isFinite(now)||
     !Number.isSafeInteger(staleAfterMinutes)||staleAfterMinutes<1||staleAfterMinutes>1440)
    throw new Error('Invalid snapshot clock inputs');
  const ageMs=now-snapshot;
  const clockState=ageMs< -5*60*1000?'future_source_timestamp':
    ageMs>staleAfterMinutes*60000?'stale_source_timestamp':'recent_source_timestamp';
  return {observed_at:new Date(now).toISOString(),
    source_reported_at:new Date(snapshot).toISOString(),
    age_minutes:Math.round(ageMs/60000),clock_state:clockState,
    freshness_is_independently_attested:false};
}
function clockNotice(clock){
  const lead=clock.clock_state==='future_source_timestamp'?'SOURCE CLOCK WARNING':
    clock.clock_state==='stale_source_timestamp'?'OLDER SNAPSHOT':'RECORDED SNAPSHOT';
  const phrase=clock.clock_state==='future_source_timestamp'?
    'The source timestamp is more than five minutes ahead of the local clock.':
    clock.clock_state==='stale_source_timestamp'?
    'The source timestamp was more than fifteen minutes old at review.':
    'The source timestamp was within fifteen minutes of local review.';
  // All inserted data is an ISO date or a closed enum derived in this module.
  return '<section aria-label="Snapshot timing warning" style="margin:0 0 28px;padding:18px 20px;border:1px solid #6f5764;border-radius:12px;background:#241a20;color:#f5e9ee">'+
    '<strong style="display:block;font:800 12px ui-monospace,monospace;letter-spacing:.09em;color:#f6b1c3">'+lead+'</strong>'+
    '<p style="margin:9px 0 6px;font-size:13px">'+phrase+' This is a file review, not a live feed.</p>'+
    '<small style="color:#cfc1c8">Source reported: '+clock.source_reported_at+
    ' · Reviewed locally: '+clock.observed_at+
    '. Neither timestamp nor this view independently proves work was performed.</small></section>';
}
export function openOperatorSnapshot({authorizedRoot,snapshot,reviewRoot,filename='saban-review.html',now=Date.now()}={}){
  if(!/^[A-Za-z0-9_-]{1,64}\.html$/.test(filename))
    throw new Error('Output filename must be a simple .html name');
  const sourceRoot=assertScopedRoot('Authorized source root',authorizedRoot);
  const raw=readScopedFile(sourceRoot,snapshot);
  const {projection,html}=buildSabanWorkProof(raw,{mode:'private_operator_snapshot'});
  const clock=classifySnapshotClock(projection.snapshot_at,{now});
  if(typeof reviewRoot!=='string'||!path.isAbsolute(reviewRoot))
    throw new Error('Private review root must be an absolute path');
  const targetDir=path.resolve(reviewRoot);
  // Reject public/repository and source-tree targets BEFORE creating directories.
  const repoRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
  if(isPublic(targetDir)||targetDir===repoRoot||within(repoRoot,targetDir)||
     targetDir===sourceRoot||within(sourceRoot,targetDir)){
    throw new Error('Review output must be in a separate private directory outside repository and source roots');
  }
  fs.mkdirSync(targetDir,{recursive:true,mode:0o700});
  const safeOutputRoot=assertScopedRoot('Private review root',reviewRoot);
  if(safeOutputRoot===repoRoot||within(repoRoot,safeOutputRoot))
    throw new Error('Review output must remain outside the repository');
  if(safeOutputRoot===sourceRoot||within(sourceRoot,safeOutputRoot))
    throw new Error('Review output must not be inside the source root');
  const output=path.join(safeOutputRoot,filename);
  const reviewedHtml=html.replace('<section class="frame">',clockNotice(clock)+'<section class="frame">');
  if(reviewedHtml===html)throw new Error('Unexpected proof-view HTML contract');
  // Exclusive creation protects existing operator review artifacts.
  fs.writeFileSync(output,reviewedHtml,{flag:'wx',mode:0o600});
  return {schema:'evercraft.graphics-command.saban-operator-review.v1',
    output,counts:projection.counts,total_jobs:projection.total_jobs,
    source_digest:projection.source_digest,clock,
    mode:'private_operator_snapshot',live:false,
    independently_attested:false,publication_authority:false};
}
function main(){
  const flags=process.argv.slice(2);
  if(flags.length!==8||flags.some((value,i)=>i%2===0&&!['--authorized-root','--snapshot','--review-root','--filename'].includes(value))){
    throw new Error('Usage: node saban-work-operator.mjs --authorized-root /private/source --snapshot /private/source/state.json --review-root /private/review --filename review.html');
  }
  const args=Object.fromEntries(Array.from({length:4},(_,i)=>[flags[2*i],flags[2*i+1]]));
  if(Object.keys(args).length!==4)throw new Error('All four named arguments required');
  const result=openOperatorSnapshot({authorizedRoot:args['--authorized-root'],snapshot:args['--snapshot'],
    reviewRoot:args['--review-root'],filename:args['--filename']});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
