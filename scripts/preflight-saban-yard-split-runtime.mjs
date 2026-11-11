#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Explicit read-only physical-device readiness probe.
// No chmod/chown, service start/stop, installation, network traffic, tokens,
// or file modification. Output contains only paths, states, and missing modules.
const ROOT_YARD='/opt/evercraft/forge-operator';
const ROOT_SABAN='/home/jessegaethle10/.local/share/evercraft/forge-operator';
const STATE_YARD='/var/lib/evercraft/nodeseed/remote-broker-resident/yard';
const STATE_SABAN='/var/lib/evercraft/saban-capacity';
const MAILBOX='/var/lib/evercraft/saban-yard-mailbox';
const ACCOUNT_YARD='evercraft';
const ACCOUNT_SABAN='jessegaethle10';

function shellOutput(cmd,args){
  try{return execFileSync(cmd,args,{encoding:'utf8',timeout:8000,stdio:['ignore','pipe','ignore']}).trim();}
  catch{return null;}
}
function statFile(file){
  try{
    const s=fs.lstatSync(file);
    return {exists:true,is_directory:s.isDirectory(),is_file:s.isFile(),
      symlink:s.isSymbolicLink(),mode:(s.mode&0o7777).toString(8)};
  }catch{return {exists:false};}
}
function access(user,flag,file){
  return shellOutput('runuser',['-u',user,'--','test',flag,file])!==null;
}
function unit(name){
  const state=shellOutput('systemctl',['show',name,
    '--property=LoadState,ActiveState,User,Group,WorkingDirectory','--no-pager']);
  const obj={name};
  if(!state)return {...obj,available:false};
  for(const line of state.split('\n')){
    const pos=line.indexOf('=');
    if(pos>0)obj[line.slice(0,pos)]=line.slice(pos+1);
  }
  obj.available=obj.LoadState==='loaded';
  return obj;
}
function ownership(file){
  return shellOutput('stat',['-c','%U:%G:%a',file]);
}
function includesImports(file,visited,missing,depth=0){
  const full=path.resolve(file);
  if(visited.has(full)||depth>80)return;
  visited.add(full);
  if(!statFile(full).is_file){missing.push(full);return;}
  const src=fs.readFileSync(full,'utf8');
  const rex=/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g;
  for(let m;(m=rex.exec(src));){
    const candidate=path.resolve(path.dirname(full),m[1]);
    includesImports(candidate,visited,missing,depth+1);
    if(visited.size>500){missing.push('too_many_imports');return;}
  }
}
function source(root,account,entrypoints){
  const rows=[];
  for(const entrypoint of entrypoints){
    const full=path.join(root,entrypoint);
    const seen=new Set(),missing=[];
    includesImports(full,seen,missing);
    rows.push({
      entrypoint,exists:statFile(full).is_file,
      dependencies_inspected:seen.size,
      missing_local_imports:[...new Set(missing)].map(x=>x.startsWith(root)?x.slice(root.length+1):x),
      readable_by_service_user:access(account,'-r',full),
    });
  }
  return {root,service_account:account,entries:rows,
    ready:rows.every(x=>x.exists&&x.readable_by_service_user&&!x.missing_local_imports.length)};
}
function exactDir(file,user,group,mode){
  const actual=ownership(file);
  return {path:file,expected:user+':'+group+':'+mode,
    actual,valid:actual===user+':'+group+':'+mode&&!statFile(file).symlink};
}

export function buildPhysicalSplitPreflight(){
  if(process.getuid?.()!==0)throw new Error('preflight_requires_sudo');
  const sabanUser=ACCOUNT_SABAN,yardUser=ACCOUNT_YARD;
  const yardGroup=shellOutput('id',['-gn',yardUser]);
  const sabanGroup=shellOutput('id',['-gn',sabanUser]);
  const yardSource=source(ROOT_YARD,yardUser,[
    'systemia/yard/remote-broker-resident.mjs',
    'systemia/yard/split-identity-request-consumer.mjs',
  ]);
  const sabanSource=source(ROOT_SABAN,sabanUser,[
    'systemia/saban/ambient-job-dispatcher.mjs',
    'systemia/saban/split-identity-cycle-runner.mjs',
  ]);
  const states=[
    {name:'yard',path:STATE_YARD,owner:ownership(STATE_YARD),
      yard_readable:access(yardUser,'-r',STATE_YARD),
      yard_writable:access(yardUser,'-w',STATE_YARD),
      saban_readable:access(sabanUser,'-r',STATE_YARD)},
    {name:'saban',path:STATE_SABAN,owner:ownership(STATE_SABAN),
      saban_readable:access(sabanUser,'-r',STATE_SABAN),
      saban_writable:access(sabanUser,'-w',STATE_SABAN),
      yard_readable:access(yardUser,'-r',STATE_SABAN)},
  ];
  const mailboxDirs=[
    exactDir(MAILBOX,'root','root','711'),
    exactDir(path.join(MAILBOX,'requests'),sabanUser,yardGroup,'2750'),
    exactDir(path.join(MAILBOX,'outcomes'),yardUser,sabanGroup,'2750'),
    exactDir(path.join(MAILBOX,'capacity'),yardUser,sabanGroup,'2750'),
  ];
  const mailbox={
    prepared:mailboxDirs.every(x=>x.valid),
    directories:mailboxDirs,
    intended_access:{
      saban_request_write:access(sabanUser,'-w',path.join(MAILBOX,'requests')),
      saban_outcome_read:access(sabanUser,'-r',path.join(MAILBOX,'outcomes')),
      saban_capacity_read:access(sabanUser,'-r',path.join(MAILBOX,'capacity')),
      yard_request_read:access(yardUser,'-r',path.join(MAILBOX,'requests')),
      yard_outcome_write:access(yardUser,'-w',path.join(MAILBOX,'outcomes')),
      yard_capacity_write:access(yardUser,'-w',path.join(MAILBOX,'capacity')),
      yard_request_write:access(yardUser,'-w',path.join(MAILBOX,'requests')),
      saban_outcome_write:access(sabanUser,'-w',path.join(MAILBOX,'outcomes')),
      saban_capacity_write:access(sabanUser,'-w',path.join(MAILBOX,'capacity')),
    },
  };
  const units=[
    unit('evercraft-nodeseed.service'),
    unit('evercraft-remote-broker-resident.service'),
    unit('evercraft-saban-dispatch.timer'),
    unit('evercraft-saban-dispatch.service'),
    unit('evercraft-yard-saban-intent-drain.timer'),
    unit('evercraft-saban-split-dispatch.timer'),
    unit('evercraft-yard-split-consumer.timer'),
  ];
  const accountBoundaryCorrect=
    states[0].yard_readable&&states[0].yard_writable&&!states[0].saban_readable&&
    states[1].saban_readable&&states[1].saban_writable&&!states[1].yard_readable;
  const accessCorrect=mailbox.prepared&&
    mailbox.intended_access.saban_request_write&&
    mailbox.intended_access.saban_outcome_read&&
    mailbox.intended_access.saban_capacity_read&&
    mailbox.intended_access.yard_request_read&&
    mailbox.intended_access.yard_outcome_write&&
    mailbox.intended_access.yard_capacity_write&&
    !mailbox.intended_access.yard_request_write&&
    !mailbox.intended_access.saban_outcome_write&&
    !mailbox.intended_access.saban_capacity_write;
  const existingSabanTimer=units.find(x=>x.name==='evercraft-saban-dispatch.timer');
  const errors=[];
  if(!yardSource.ready)errors.push('yard_installed_source_incomplete');
  if(!sabanSource.ready)errors.push('saban_installed_source_incomplete');
  if(!accountBoundaryCorrect)errors.push('private_state_account_boundary_unverified');
  if(!accessCorrect)errors.push('split_mailbox_not_prepared_or_access_invalid');
  if(existingSabanTimer?.ActiveState==='active')errors.push('existing_saban_dispatch_timer_must_be_coordinated');
  if(units[0]?.ActiveState!=='active'||units[1]?.ActiveState!=='active')
    errors.push('existing_physical_compute_not_confirmed_active');
  return {
    schema:'evercraft.systemia.split-identity-physical-preflight.v1',
    ready_for_automatic_activation:errors.length===0,
    must_not_auto_activate:true,
    errors,
    source:{yard:yardSource,saban:sabanSource},
    private_states:states,
    mailbox,
    units,
    read_only:true,
    secrets_read:false,
    service_changes:false,
    filesystem_changes:false,
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  try{
    const result=buildPhysicalSplitPreflight();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.ready_for_automatic_activation)process.exitCode=3;
  }catch(error){
    process.stderr.write('PREFLIGHT_BLOCKED: '+String(error?.message||'unknown')+'\n');
    process.exitCode=2;
  }
}
