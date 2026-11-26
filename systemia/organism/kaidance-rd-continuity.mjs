// Owner-private, read-only continuity reconciliation. No new mission authority.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {inspectMissionContinuity} from './mission-continuity-readonly.mjs';

const base={execution_authorized:false,publication_authorized:false,
  worker_launches:0,physical_experiments:0,verified_research_artifacts:0};
const hold=(status)=>({...base,status,coverage_verified:false,missions:null});
const str=(x)=>typeof x==='string'&&x.trim().length>0&&x.length<=240;
// Match the owner's reported completed-work receipt to the existing durable
// Systemia goal-state format. A matched checkpoint is not independent artifact proof.
export function matchGoalReceipt(m,state,now=new Date()){
  const binding=m?.goal_binding, receipt=m?.last_work_receipt;
  if(!binding)return 'goal_binding_missing';
  if(!state||state.schema!=='evercraft.goal.state.v1'||
     state.mission_key!==m.mission_id||state.goal_key!==binding.goal_key||
     !Number.isSafeInteger(state.revision)||state.revision<2||
     !Array.isArray(state.tasks)||state.tasks.length>2000)
    return 'goal_state_mismatch';
  const matches=state.tasks.filter(t=>t?.work_key===binding.work_key);
  if(matches.length!==1)return 'goal_task_missing_or_duplicate';
  const task=matches[0], observed=Date.parse(receipt?.observed_at);
  if(task.mission_key!==m.mission_id||task.goal_key!==binding.goal_key||
     task.status!=='complete'||task.last_result!=='complete'||
     !Number.isSafeInteger(task.attempt)||task.attempt<1||
     task.recovery_hold||!str(receipt?.ref)||
     !Array.isArray(task.receipt_refs)||!task.receipt_refs.includes(receipt.ref)||
     !Number.isFinite(observed)||observed>+new Date(now)||
     Date.parse(task.updated_at)!==observed)
    return 'completed_work_receipt_not_matched';
  return 'completed_work_checkpoint_matched';
}
export function reconcileResearchExport(value,now=new Date(),readGoal=null){
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
    let goalReadback='goal_binding_missing';
    if(m.goal_binding){
      try{goalReadback=readGoal?matchGoalReceipt(m,readGoal(m.goal_binding),now):'goal_reader_unavailable'}
      catch{goalReadback='goal_read_failed'}
    }
    const row=result.missions[0], needsReadback=!['paused','terminal'].includes(row.disposition);
    if(needsReadback&&goalReadback!=='completed_work_checkpoint_matched'){
      row.problems=[...row.problems,'goal_receipt_readback_unverified'].sort();
      row.status='needs_attention';
    }
    rows.push({...row,goal_readback:goalReadback,priority:priority.has(m.mission_id)});
  }
  if(!rows.length)return hold('no_admitted_rows_unverified');
  const priorityMissing=[...priority].filter(id=>!value.missions.some(m=>m.mission_id===id&&m.admission_state==='admitted')).length;
  rows.sort((a,b)=>Number(b.priority)-Number(a.priority)||a.mission_ref.localeCompare(b.mission_ref));
  const attention=rows.filter(r=>r.problems.length).length;
  return {...base,status:attention||priorityMissing?'review_required':'reported_receipts_reconciled',
    coverage_verified:false,source_authority:'owner_export_reported_not_independently_verified',
    observed_at:new Date(now).toISOString(),exported_at:value.exported_at,
    counts:{reported_rows:value.missions.length,reported_admitted:rows.length,
      attention,priority_missing:priorityMissing,
      goal_checkpoints_matched:rows.filter(r=>r.goal_readback==='completed_work_checkpoint_matched').length},
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
    privateStat(parent,true);
    privateStat(dir,true);
    if(fs.realpathSync(dir)!==dir)return {status:'held'};
    let result;
    try{result=reconcileResearchExport(readBounded(path.join(dir,'mission-export.json')),now,binding=>{
      // Explicit owner crosswalk only; never crawl a private filesystem.
      if(!str(binding?.goal_key)||!str(binding?.work_key)||!str(binding?.state_relpath))
        throw Error('goal_binding_invalid');
      const parts=binding.state_relpath.split('/');
      if(parts.length<2||parts.length>12||parts.some(part=>!(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,100}$/).test(part))||
         !parts.at(-1).endsWith('.json')||parts[0]==='kaidance-rd-continuity')
        throw Error('goal_path_invalid');
      let current=parent;
      for(const component of parts.slice(0,-1)){
        current=path.join(current,component);privateStat(current,true);
      }
      const file=path.join(current,parts.at(-1));
      if(fs.realpathSync(file)!==file)throw Error('goal_path_invalid');
      return readBounded(file);
    })}
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
