// Owner-private export transport for the existing CRM/heartbeat interface.
// Not a second CRM database or an authorization service. The authorized caller
// supplies evidence-reviewed records; no mail, dispatch, fees or publication.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {projectExternalDependencies} from './external-dependencies.mjs';
const LIMIT=2000000, ROWS=10000;
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1000;
const stable=o=>JSON.stringify(o,Object.keys(o).sort());
const requestFields=['request_id','type','subject_ref','scope_ref','state','submitted_at','submission_evidence_ref','closure_evidence_ref','thread_ref','case_ref','mission_ref','owner_ref','intent_snapshot_ref','continuation_plan_ref','follow_up_at','follow_up_basis_ref','follow_up_hold'];
const receiptFields=['event_id','kind','evidence_ref','subject_ref','occurred_at','thread_ref','case_ref','artifact_ref','remaining_scope_ref'];
const ackFields=['continuation_id','review_evidence_ref','reviewer_ref','reviewed_at'];
function clean(row,fields){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('invalid_row');
 const o={};
 for(const k of fields){
  const v=row[k];
  if(v==null)continue;
  if(k==='follow_up_hold'){if(typeof v!=='boolean')throw Error('invalid_hold');o[k]=v}
  else{if(!str(v))throw Error('invalid_field_'+k);o[k]=v}
 }
 return o;
}
function rows(value,fields){
 if(!Array.isArray(value)||value.length>ROWS)throw Error('bounded_rows_required');
 return value.map(x=>clean(x,fields));
}
function indexed(rows,key){
 const m=new Map();for(const r of rows){if(!str(r[key])||m.has(r[key]))throw Error('duplicate_or_missing_'+key);m.set(r[key],r)}return m;
}
function privateStat(p,dir){
 const s=fs.lstatSync(p);
 if(s.isSymbolicLink()||(dir?!s.isDirectory():!s.isFile())||
  typeof process.getuid!=='function'||s.uid!==process.getuid()||(s.mode&0o077)!==0||
  (!dir&&s.nlink!==1))throw Error('private_path_required');
 return s;
}
function readExisting(file){
 try{privateStat(file,false)}catch(e){if(e.code==='ENOENT')return null;throw e}
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const s=fs.fstatSync(fd);
  if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)||s.size>LIMIT)throw Error('unsafe_existing_export');
  const bytes=fs.readFileSync(fd);
  if(bytes.length!==s.size)throw Error('existing_export_changed');
  const value=JSON.parse(bytes);
  if(value.schema!=='evercraft.crm.external-dependencies-export.v1'||
   !Number.isSafeInteger(value.revision)||value.revision<1||
   !Array.isArray(value.continuation_review_receipts))throw Error('legacy_or_invalid_export_review_required');
  return {value,hash:digest(bytes)};
 }finally{fs.closeSync(fd)}
}
function preserve(previous,next,key,mutable=[]){
 const m=indexed(next,key);
 for(const old of previous){
  const row=m.get(old[key]);
  if(!row)throw Error('history_removal_refused');
  for(const k of Object.keys(old)){
   if(mutable.includes(k))continue;
   if(old[k]!==row[k])throw Error('historical_binding_change_refused');
  }
 }
}
export function writePrivateDependencyExport({root,outDir,expectedHash,requests,receipts,acknowledgments=[],coverage,now=new Date()}={}){
 if(expectedHash!==null&&!/^sha256:[a-f0-9]{64}$/.test(expectedHash||''))throw Error('expected_hash_required');
 if(!['complete','partial'].includes(coverage))throw Error('coverage_required');
 const repo=fs.realpathSync(root),parent=path.dirname(path.resolve(outDir));
 if(fs.realpathSync(parent)!==parent)throw Error('unsafe_parent');
 const dir=path.join(parent,'kaidance-crm-dependencies');
 if(dir===repo||dir.startsWith(repo+path.sep)||dir===path.resolve(outDir))throw Error('unsafe_directory');
 privateStat(parent,true);privateStat(dir,true);
 if(fs.realpathSync(dir)!==dir)throw Error('unsafe_directory');
 const file=path.join(dir,'request-export.json'),lock=file+'.lock';
 // Cross-process single-writer fence; an orphan is held for operator review.
 fs.mkdirSync(lock,{mode:0o700});
 let temp;
 try{
  const prior=readExisting(file);
  if((prior?.hash??null)!==expectedHash)throw Error('export_revision_conflict');
  const at=new Date(now).toISOString();
  if(prior&&Date.parse(at)<Date.parse(prior.value.exported_at))throw Error('export_time_regression');
  const req=rows(requests,requestFields),rec=rows(receipts,receiptFields),acks=rows(acknowledgments,ackFields);
  const requestMap=indexed(req,'request_id');indexed(rec,'event_id');indexed(acks,'continuation_id');
  if(prior){
   const p=prior.value;
   preserve(p.requests,req,'request_id',['state','follow_up_at','follow_up_basis_ref','follow_up_hold']);
   for(const old of p.requests){
    const next=requestMap.get(old.request_id);
    if(old.state!==next.state&&!(old.state==='draft'&&next.state==='submitted')&&
       !(old.state==='submitted'&&['resolved','cancelled'].includes(next.state)))
     throw Error('request_state_regression');
    if(old.follow_up_hold===true&&next.follow_up_hold!==true)throw Error('hold_release_requires_separate_review');
   }
   preserve(p.receipts,rec,'event_id');
   preserve(p.continuation_review_receipts,acks,'continuation_id');
  }
  const projection=projectExternalDependencies({requests:req,receipts:rec,now:at});
  const valid=new Set([...projection.candidates.map(x=>x.continuation_id),...(prior?.value.reviewed_continuation_ids??[])]);
  for(const a of acks){
   if(!valid.has(a.continuation_id)||!str(a.review_evidence_ref)||!str(a.reviewer_ref)||
      !Number.isFinite(Date.parse(a.reviewed_at))||Date.parse(a.reviewed_at)>Date.parse(at))
    throw Error('continuation_review_evidence_required');
  }
  const value={schema:'evercraft.crm.external-dependencies-export.v1',scope:'authorized_external_dependencies',
   revision:(prior?.value.revision??0)+1,previous_hash:prior?.hash??null,exported_at:at,coverage,
   requests:req,receipts:rec,continuation_review_receipts:acks,reviewed_continuation_ids:acks.map(a=>a.continuation_id)};
  const bytes=Buffer.from(JSON.stringify(value)+'\n');
  if(bytes.length>LIMIT)throw Error('export_too_large');
  temp=path.join(dir,'.export-'+randomBytes(16).toString('hex'));
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  fs.renameSync(temp,file);temp=null;
  const dirfd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
  try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  return {schema:'evercraft.crm.external-dependencies-export-receipt.v1',revision:value.revision,hash:digest(bytes),
   execution_authorized:false,publication_authorized:false};
 }finally{if(temp)fs.rmSync(temp,{force:true});fs.rmdirSync(lock)}
}
