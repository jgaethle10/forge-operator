#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Read-only inspection of the existing Penguin broker unit and process.
// NEVER runs systemctl restart/stop/start, changes files, reads environment,
// prints full process arguments, prints secrets, or requests broker authority.
const UNIT='evercraft-remote-broker-resident.service';
const SOURCE_ROOT='/opt/evercraft/forge-operator';
const EXPECTED=path.join(SOURCE_ROOT,'systemia/yard/remote-broker-resident.mjs');
const SOURCE_SUFFIX=/^\/[a-zA-Z0-9_/.-]+\.mjs$/;
const THIS_FILE=fileURLToPath(import.meta.url);

function safeScript(value){
  const candidate=String(value||'');
  return SOURCE_SUFFIX.test(candidate) && path.posix.normalize(candidate)===candidate
    ? candidate
    : null;
}
function redactedScriptPath(value){
  // Inspect only filenames under the known Evercraft runtime tree.
  const safe=safeScript(value);
  return safe&&safe.startsWith(SOURCE_ROOT+'/')?safe:null;
}
export function scriptsFromExecStart(value){
  // systemctl show --value -p ExecStart returns a structured property,
  // e.g. "{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/.../x.mjs ; ... }".
  // We do not echo the property: argv may include tokens.
  const raw=String(value||'');
  const match=raw.match(/\bargv\[\]=([^;]*)/);
  const argv=match?match[1]:'';
  return [...new Set((argv.match(/\/[a-zA-Z0-9_/.-]+\.mjs\b/g)||[])
    .map(redactedScriptPath).filter(Boolean))];
}
export function scriptFromProcCmdline(raw){
  // Parse only the probable Node script, redact all other arguments.
  const args=String(raw||'').split('\0').filter(Boolean);
  return args.map(redactedScriptPath).find(Boolean)||null;
}
function shellShow(field){
  try{
    return execFileSync('systemctl',['show',UNIT,'--value','-p',field],{
      encoding:'utf8',timeout:6000,stdio:['ignore','pipe','ignore'],
    }).trim();
  }catch{return '';}
}
function readLink(file){
  try{return fs.readlinkSync(file);}catch{return null;}
}
function sourceState(script){
  if(!script)return {path:null,present:false,regular_file:false,symlink:false};
  let stat;
  try{stat=fs.lstatSync(script);}
  catch{return {path:script,present:false,regular_file:false,symlink:false};}
  const regular=stat.isFile()&&!stat.isSymbolicLink();
  let digest=null;
  if(regular){
    try{digest=createHash('sha256').update(fs.readFileSync(script)).digest('hex');}
    catch{}
  }
  return {
    path:script,present:true,regular_file:regular,symlink:stat.isSymbolicLink(),
    byte_count:regular?stat.size:null,
    sha256:digest,
  };
}

export function analyzeBrokerRestartSafety({unit,proc,configuredScriptState,expectedScriptState}={}){
  const config=unit||{},running=proc||{};
  const issues=[];
  if(config.load_state!=='loaded')issues.push('broker_unit_not_loaded');
  if(config.active_state!=='active')issues.push('broker_not_active');
  if(!Number.isInteger(running.pid)||running.pid<=0)issues.push('broker_pid_unverified');
  if(!config.script)issues.push('systemd_launch_script_unresolved');
  if(!running.script)issues.push('running_process_script_unresolved');
  if(config.script&&running.script&&config.script!==running.script)
    issues.push('running_script_differs_from_systemd_unit');
  if(config.script!==EXPECTED)
    issues.push('service_entrypoint_differs_from_expected_legacy_path');
  if(!configuredScriptState?.regular_file)
    issues.push('systemd_launch_source_unavailable');
  if(config.active_state==='active' &&
     ['always','on-failure','on-abnormal','on-watchdog','on-abort'].includes(config.restart) &&
     !configuredScriptState?.regular_file)
    issues.push('automatic_restart_source_missing');
  if(!expectedScriptState?.regular_file)
    issues.push('legacy_broker_entrypoint_missing');
  if(running.cwd!==SOURCE_ROOT)
    issues.push('unexpected_running_working_directory');
  if(config.user!=='evercraft'||config.group!=='evercraft')
    issues.push('broker_unit_account_mismatch');

  // Source existence is only a prerequisite, not evidence that the stored
  // script reproduces the running broker's identity, lease, or trust policy.
  return {
    schema:'evercraft.yard.resident-broker-restart-safety.v1',
    service:UNIT,
    active:config.active_state==='active',
    running_pid:running.pid||null,
    running_cwd:running.cwd||null,
    running_script:running.script||null,
    systemd_script:config.script||null,
    systemd_restart_policy:config.restart||null,
    configured_source:configuredScriptState||null,
    legacy_expected_source:expectedScriptState||null,
    issues,
    source_provenance_verified:false,
    identity_compatibility_verified:false,
    safe_restart_authorized:false,
    must_preserve_running_process:true,
    secrets_read:false,
    service_changes:false,
    filesystem_changes:false,
    guidance:'Read-only source recovery required. Do not restart or replace the broker based on this report.',
  };
}
export function inspectResidentBrokerRestartSafety(){
  const execStart=shellShow('ExecStart');
  const scripts=scriptsFromExecStart(execStart);
  const pidValue=Number(shellShow('MainPID'));
  const pid=Number.isInteger(pidValue)&&pidValue>0?pidValue:null;
  let procScript=null;
  let cwd=null;
  if(pid){
    try{procScript=scriptFromProcCmdline(fs.readFileSync('/proc/'+pid+'/cmdline','utf8'));}
    catch{}
    cwd=readLink('/proc/'+pid+'/cwd');
  }
  const config={
    load_state:shellShow('LoadState'),
    active_state:shellShow('ActiveState'),
    user:shellShow('User'),
    group:shellShow('Group'),
    restart:shellShow('Restart'),
    script:scripts.length===1?scripts[0]:null,
  };
  return analyzeBrokerRestartSafety({
    unit:config,
    proc:{pid,script:procScript,cwd},
    configuredScriptState:sourceState(config.script),
    expectedScriptState:sourceState(EXPECTED),
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===THIS_FILE){
  try{
    if(process.getuid?.()!==0)throw new Error('read_only_broker_audit_requires_sudo');
    const report=inspectResidentBrokerRestartSafety();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    // Restart is ALWAYS blocked here. Exit 3 means this is a diagnostic
    // hold, not a failed physical compute acceptance.
    process.exitCode=3;
  }catch(error){
    process.stderr.write(JSON.stringify({
      ok:false,schema:'evercraft.yard.resident-broker-restart-safety-error.v1',
      error:String(error?.message||'audit_failed').slice(0,120),
      service_changes:false,
    })+'\n');
    process.exitCode=2;
  }
}
