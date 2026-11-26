// Owner-private, read-only continuity reconciliation. No new mission authority.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {inspectMissionContinuity} from './mission-continuity-readonly.mjs';

const base={execution_authorized:false,publication_authorized:false,
  worker_launches:0,physical_experiments:0,verified_research_artifacts:0};
const hold=(status)=>({...base,status,coverage_verified:false,missions:null});
const str=(x)=>typeof x==='string'&&x.trim().length>0&&x.length<=240;
export function reconcileResearchExport(value,now=new Date()){
  const clock=+new Date(now), age=clock-Date.parse(value?.exported_at);
  if(!Number.isFinite(clock)||!Number.isFinite(age)||age<0||age>900000)
    return hold('stale_or_missing_export');
  if(value.schema!=='evercraft.systemia.rd-continuity-export.v1'||
    value.scope!=='all_rd' || value.coverage_complete!==true ||
    !Array.isArray(value.missions)||value.missions.length>2000||
    !Array.isArray(value.priority_mission_ids)||!value.priority_mission_ids.length||
    value.priority_mission_ids.length>200||!value.priority_mission_ids.every(str))
    return hold('invalid_or_partial_export');
  const ids=new Set(), priority=new Set(value.priority_mission_ids), rows=[];
  if(priority.size!==value.priority_mission_ids.length)return hold('duplicate_priority');
  for(const m of value.missions){
    if(!m||!str(m.mission_id)||ids.has(m.mission_id)||
       !['admitted','proposed','discovered','rejected'].includes(m.admission_state))
      return hold('invalid_or_duplicate_mission');
    ids.add(m.mission_id);
    if(m.admission_state!=='admitted')continue;
    if(!['active','paused','terminal','blocked_needs_human'].includes(m.disposition)||
       !Number.isFinite(m.receipt_sla_seconds)||m.receipt_sla_seconds<300||
       m.receipt_sla_seconds>90*86400)
      return hold('invalid_mission_contract');
    const result=inspectMissionContinuity({missions:[{...m,visibility:'internal_only'}],
      now,staleAfterDays:m.receipt_sla_seconds/86400});
    rows.push({...result.missions[0],priority:priority.has(m.mission_id)});
  }
  if(!rows.length)return hold('no_admitted_rows_unverified');
  const priorityMissing=[...priority].filter(id=>!value.missions.some(m=>m.mission_id===id&&m.admission_state==='admitted')).length;
  rows.sort((a,b)=>Number(b.priority)-Number(a.priority)||a.mission_ref.localeCompare(b.mission_ref));
  const attention=rows.filter(r=>r.problems.length).length;
  return {...base,status:attention||priorityMissing?'review_required':'reported_receipts_reconciled',
    coverage_verified:false,source_authority:'owner_export_reported_not_independently_verified',
    observed_at:new Date(now).toISOString(),exported_at:value.exported_at,
    counts:{reported_rows:value.missions.length,reported_admitted:rows.length,
      attention,priority_missing:priorityMissing},
    missions:rows};
}
function privateStat(p,isDir){
  const s=fs.lstatSync(p);
  if(s.isSymbolicLink()||(isDir?!s.isDirectory():!s.isFile())||
     typeof process.getuid!=='function'||s.uid!==process.getuid()||
     (s.mode&0o077)!==0)throw Error('private_path_required');
  return s;
}
function readBounded(p){
  privateStat(p,false);
  const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const s=fs.fstatSync(fd);
    if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>2_000_000)
      throw Error('private_export_invalid');
    const b=Buffer.alloc(s.size+1);const n=fs.readSync(fd,b,0,b.length,0);
    if(n!==s.size)throw Error('private_export_changed');
    return JSON.parse(b.subarray(0,n).toString('utf8'));
  }finally{fs.closeSync(fd);}
}
export function runPrivateResearchContinuity({enabled=false,root,outDir,now=new Date()}={}){
  if(!enabled)return {status:'not_configured'};
  try{
    const repo=fs.realpathSync(root), parent=fs.realpathSync(path.dirname(path.resolve(outDir)));
    const dir=path.join(parent,'kaidance-rd-continuity');
    if(dir===path.resolve(outDir)||dir===repo||dir.startsWith(repo+path.sep))
      return {status:'held'};
    privateStat(dir,true);
    if(fs.realpathSync(dir)!==dir)return {status:'held'};
    let result;
    try{result=reconcileResearchExport(readBounded(path.join(dir,'mission-export.json')),now)}
    catch{result=hold('export_unavailable_or_invalid')}
    const file=path.join(dir,'latest.json');
    if(fs.existsSync(file))privateStat(file,false);
    const temp=path.join(dir,'.latest-'+randomBytes(12).toString('hex'));
    try{fs.writeFileSync(temp,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
      fs.renameSync(temp,file);}
    finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    // No counts, identifiers, receipt refs, reasons or file paths escape private state.
    return {status:result.missions?'private_reconciled':'held'};
  }catch{return {status:'held'}}
}
