#!/usr/bin/env node
/**
 * Read-only filesystem witness for one fresh zero-authority shadow broker.
 * Scoped to the canary's private broker-state directory, not legacy state.
 * No file contents opened; no routes, services, leases or grants changed.
 * Absence of grants in this directory does not independently prove absence
 * of external route bindings or historical authority use elsewhere.
 */
import fs from 'node:fs';
import path from 'node:path';

const STAGES=new Set(['before','during','after']);

function contained(parent,child){
  const rel=path.relative(parent,child);
  return rel!==''&&!rel.startsWith('..'+path.sep)&&
    rel!=='..'&&!path.isAbsolute(rel);
}
function safeDirectory(input,strict=false){
  const stat=fs.lstatSync(input);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
     (strict&&(stat.mode&0o077)!==0)||
     (!strict&&(stat.mode&0o022)!==0))
    throw Error('unsafe_directory');
  const resolved=fs.realpathSync(input);
  if(resolved!==path.resolve(input))
    throw Error('directory_changed_or_symlinked');
  return resolved;
}

/** Evaluates read-only metadata from a dedicated one-shot canary root. */
export function inspectFreshBrokerState({
  nodeRoot,journalDir,stage,
}={}){
  const holds=[];
  let entries=null,missingBefore=false;
  try{
    if(!STAGES.has(stage))throw Error('unsupported_stage');
    const root=safeDirectory(nodeRoot);
    const journal=safeDirectory(journalDir,true);
    if(!contained(root,journal)||
       !/^shadow-canary-[A-Za-z0-9_-]+$/.test(path.basename(journal)))
      throw Error('journal_not_fresh_under_node_root');
    if(journal.includes(path.sep+'remote-broker-resident'+path.sep))
      throw Error('historical_broker_path_forbidden');
    const stateDir=path.join(journal,'broker-state');
    if(stage==='before'){
      try{
        fs.lstatSync(stateDir);
        holds.push('broker_state_exists_before_submission');
      }catch(error){
        if(error?.code==='ENOENT')missingBefore=true;
        else holds.push('broker_state_status_unavailable');
      }
    }else{
      safeDirectory(stateDir,true);
      const dir=fs.opendirSync(stateDir);
      try{
        entries=[];
        for(;;){
          const entry=dir.readSync();
          if(!entry)break;
          entries.push(entry.name);
          if(entries.length>128)throw Error('state_directory_too_many_entries');
        }
      }finally{dir.closeSync()}
      if(entries.length!==0)holds.push('broker_state_not_empty');
    }
  }catch(error){
    holds.push(String(error?.message||'state_witness_unavailable').slice(0,80));
  }
  return {
    schema:'evercraft.yard.shadow-broker-fresh-state-witness.v1',
    stage:STAGES.has(stage)?stage:null,
    verified:holds.length===0,
    hold_reasons:holds,
    state_absent_before_job:stage==='before'&&missingBefore,
    state_directory_empty:stage==='before'?null:
      Array.isArray(entries)&&entries.length===0,
    only_fresh_canary_root_examined:true,
    file_contents_read:false,
    historical_grants_read:false,
    historical_authority_import_proven_absent:false,
    independent_public_route_absence_proven:false,
    physical_broker_activation_authorized:false,
    services_changed:false,
  };
}
