#!/usr/bin/env node
/**
 * Read-only provenance and UDP listener audit for the running Penguin NodeSeed.
 * Never logs process arguments, environment, tokens, device fingerprints or
 * source bytes. Hashes on disk and launch-path correlation are NOT proof of
 * loaded JavaScript bytes. No service or authority mutation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseOwnedTcpPorts} from './inspect-penguin-nodeseed-residents.mjs';

const ROOT='/opt/evercraft/forge-operator';
const UNIT='evercraft-nodeseed.service';
const FILES=[
  ['systemia/compute/runtime-node.mjs','1d85a3bf25f9db02fee8f817e2fe337e32306447'],
  ['systemia/network/outbound-capacity-broker.mjs','6a44cc2a6aca90693ba034100a9da6b75f29eee4'],
  ['systemia/yard/operator.mjs','f36a121e8c872ca7d1f72990a2320266adda640b'],
];
const MAX=16*1024*1024;

export function parseProcessInvocation(cmdline,cwd,sourceRoot){
  // This helper never returns original process arguments.
  const args=Buffer.isBuffer(cmdline)
    ? cmdline.toString('utf8').split('\0').filter(Boolean)
    : String(cmdline).split('\0').filter(Boolean);
  const root=path.resolve(sourceRoot);
  const knownEntry=path.join(root,'systemia/compute/node-seed.mjs');
  const possible=args.slice(1).filter(value=>
    /\.(?:mjs|js)$/.test(value) && !value.startsWith('-')
  );
  const resolved=possible.map(value=>{
    try{
      return path.resolve(cwd,value);
    }catch{return ''}
  });
  const relativeScripts=resolved.map(value=>{
    const rel=path.relative(root,value);
    return rel!=='' && rel!=='..' && !rel.startsWith('..'+path.sep) &&
      !path.isAbsolute(rel) ? rel : null;
  }).filter(Boolean);
  return {
    known_nodeseed_entrypoint_invoked:resolved.includes(knownEntry),
    // Filenames only, never arbitrary arguments or injected data.
    source_tree_script_paths:relativeScripts.filter(v=>
      /^[A-Za-z0-9._/-]+$/.test(v)
    ).slice(0,6),
    process_arguments_printed:false,
  };
}

export function classifySourceAge({mtimeMs,ctimeMs,startedAtMs}){
  if(!Number.isFinite(startedAtMs)||startedAtMs<=0)
    return {unchanged_since_start:null};
  if(!Number.isFinite(mtimeMs)||!Number.isFinite(ctimeMs))
    return {unchanged_since_start:null};
  // /proc/stat btime has one-second granularity; keep margin.
  return {unchanged_since_start:
    mtimeMs < startedAtMs-1500 && ctimeMs < startedAtMs-1500};
}

function unitProperty(name){
  return execFileSync('systemctl',[
    'show',UNIT,'--value','-p',name,
  ],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();
}
function processStartedAtMs(pid){
  const raw=fs.readFileSync('/proc/'+pid+'/stat','utf8');
  const end=raw.lastIndexOf(')');
  if(end<0)throw Error('proc_stat_invalid');
  const tail=raw.slice(end+2).trim().split(/\s+/);
  const ticksSinceBoot=Number(tail[19]); // /proc field 22
  const uptime=fs.readFileSync('/proc/stat','utf8');
  const boot=uptime.match(/^btime\s+(\d+)\s*$/m);
  const hz=Number(execFileSync('getconf',['CLK_TCK'],{
    encoding:'utf8',timeout:5000,
  }).trim());
  if(!boot||!Number.isFinite(ticksSinceBoot)||ticksSinceBoot<0||
     !Number.isFinite(hz)||hz<=0)
    throw Error('proc_start_time_unavailable');
  return Number(boot[1])*1000+ticksSinceBoot/hz*1000;
}
function onDiskBlob(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX)
    throw Error('source_file_untrusted');
  const data=fs.readFileSync(file);
  const gitBlob=createHash('sha1')
    .update('blob '+data.length+'\0').update(data).digest('hex');
  return {stat,gitBlob};
}
function ownedUdpPorts(pid){
  try{
    const raw=execFileSync('ss',['-H','-lunp'],{
      encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024,
      stdio:['ignore','pipe','ignore'],
    });
    return {complete:true,ports:parseOwnedTcpPorts(raw,pid)};
  }catch{
    return {complete:false,ports:[]};
  }
}
export function inspectLiveLaunchProvenance(){
  if(process.getuid?.()!==0)throw Error('root_required_for_proc_inventory');
  if(unitProperty('ActiveState')!=='active')throw Error('nodeseed_inactive');
  const pid=Number(unitProperty('MainPID'));
  if(!Number.isInteger(pid)||pid<=0||!fs.existsSync('/proc/'+pid))
    throw Error('nodeseed_main_pid_invalid');

  const sourceRoot=fs.realpathSync(ROOT);
  const cwd=fs.readlinkSync('/proc/'+pid+'/cwd');
  const cmdline=fs.readFileSync('/proc/'+pid+'/cmdline');
  const parsed=parseProcessInvocation(cmdline,cwd,sourceRoot);
  let startedAtMs=null;
  try{startedAtMs=processStartedAtMs(pid)}catch{}

  const hashes=FILES.map(([rel,expected])=>{
    try{
      const {stat,gitBlob}=onDiskBlob(path.join(sourceRoot,rel));
      const age=classifySourceAge({
        mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,startedAtMs,
      });
      return {
        source:rel,
        matches_known_historical_blob:gitBlob===expected,
        unchanged_since_process_start:age.unchanged_since_start,
        file_regular:true,
      };
    }catch{
      return {
        source:rel,
        matches_known_historical_blob:false,
        unchanged_since_process_start:null,
        file_regular:false,
      };
    }
  });
  const udp=ownedUdpPorts(pid);
  return {
    schema:'evercraft.penguin.live-nodeseed-launch-provenance.v1',
    read_only:true,
    process_running:true,
    known_entrypoint_invoked:parsed.known_nodeseed_entrypoint_invoked,
    source_tree_scripts_from_invocation:parsed.source_tree_script_paths,
    historical_source_blobs:hashes,
    all_source_blobs_match_known_history:
      hashes.every(x=>x.matches_known_historical_blob),
    all_source_files_predate_process_start:
      hashes.every(x=>x.unchanged_since_process_start===true),
    process_start_time_available:Number.isFinite(startedAtMs),
    udp_socket_inventory_available:udp.complete,
    udp_1053_owned_by_nodeseed:udp.complete?udp.ports.includes(1053):null,
    // Explicitly distinguish invocation/disk evidence from loaded JS.
    exact_loaded_javascript_bytes_proven:false,
    process_arguments_or_environment_printed:false,
    private_authorization_inspected:false,
    services_changed:false,
    physical_broker_canary_authorized:false,
  };
}
const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  try{
    const out=inspectLiveLaunchProvenance();
    console.log(JSON.stringify(out,null,2));
    if(!out.all_source_blobs_match_known_history ||
       !out.all_source_files_predate_process_start ||
       !out.known_entrypoint_invoked ||
       !out.udp_socket_inventory_available ||
       out.udp_1053_owned_by_nodeseed!==true)
      process.exitCode=3;
  }catch(error){
    console.error(JSON.stringify({
      schema:'evercraft.penguin.launch-provenance-hold.v1',
      reason:String(error?.message||'audit_unavailable').slice(0,100),
      read_only:true,
      physical_broker_canary_authorized:false,
    }));
    process.exitCode=3;
  }
}
