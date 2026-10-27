#!/usr/bin/env node
/**
 * Read-only physical NextGen Chromium failure inspection.
 * Runs ldd on Playwright's exact pinned local headless-shell, then at most
 * one about:blank launch. No URLs, network workflows, sudo, installs,
 * remote device access, registry modifications or agent mutation.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=path.join(REPO,'systemia/evercraft-web/browser-worker');
const BROWSERS=path.join(os.homedir(),'.local/state/evercraft-nextgen-browser/browsers');
const requireFromWorker=createRequire(path.join(SOURCE,'package.json'));

export function classifyChromiumFailure({missing=[],log='',timedOut=false}={}){
  if(missing.length)return 'missing_system_shared_libraries';
  const lower=String(log).toLowerCase();
  if(/glibc_|version .glibc|symbol lookup error|undefined symbol/.test(lower))return 'binary_or_glibc_incompatibility';
  if(/no usable sandbox|setuid sandbox|namespace.*fail|operation not permitted/.test(lower))return 'sandbox_or_user_namespace_denied';
  if(/failed to load.*\.so|cannot open shared object|error while loading shared librar/.test(lower))return 'dynamic_linker_load_failure';
  if(/trace\/breakpoint|sigtrap|sigsegv|segmentation fault|illegal instruction|sigill/.test(lower))return 'browser_process_crashed';
  if(timedOut)return 'browser_launch_timeout';
  if(/target page, context or browser has been closed|browser closed|process exited/.test(lower))return 'browser_closed_reason_unresolved';
  return lower.trim()?'browser_launch_error_unclassified':'no_diagnostic_stderr';
}
export function missingLddNames(raw=''){
  return [...new Set(String(raw).split('\n').map(line=>{
    const m=line.match(/^\s*([a-zA-Z0-9_.+-]+\.so(?:\.[0-9]+)*)\s+=>\s+not found\s*$/);
    return m?.[1]||null;
  }).filter(Boolean))].slice(0,30);
}
export function maskedErrorLines(raw=''){
  const lines=String(raw).split(/\r?\n/);
  const interesting=lines.filter(line=>/error|failed|fatal|closed|missing|cannot|denied|sandbox|namespace|sigsegv|sigtrap|glibc|not found|symbol|crash|zygote|dbus/i.test(line));
  return (interesting.length?interesting:lines).slice(-14).map(line=>line
    .replaceAll(os.homedir(),'~')
    .replace(/--user-data-dir=\S+/gi,'--user-data-dir=[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi,'[URL_REDACTED]')
    .replace(/(?:Bearer\s+)[^\s]+/gi,'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9_-]{48,}/g,'[OPAQUE_REDACTED]')
    .slice(0,300)
  ).filter(Boolean);
}
function nodeOnly(){
  if(process.platform!=='linux'||os.hostname().toLowerCase()!=='nextgen')throw Error('physical_nextgen_linux_required');
}
async function diagnose(){
  if(process.argv.length!==2)throw Error('diagnostic_takes_no_arguments');
  nodeOnly();
  const out={
    schema:'evercraft.nextgen.browser-launch-diagnosis.v1',
    node_id:'evercraft-node002-nextgen',
    observed_at:new Date().toISOString(),
    report_is_read_only:true,
    installs_or_updates_performed:false,
    sudo_or_system_packages_used:false,
    remote_jobs_enabled_by_diagnosis:false,
    portal_forms_submitted:false,
    browser_url_visited:false,
    os_release:'unverified',
    installed_playwright_version:null,
    binary_found:false,
    missing_shared_libraries:[],
    chromium_launch_state:'not_started',
    chromium_launch_failure_category:null,
    relevant_browser_stderr:[],
  };
  try{
    const osrel=fs.readFileSync('/etc/os-release','utf8');
    const id=osrel.match(/^ID=([^\n]+)/m)?.[1]?.replaceAll('"','')||'unknown';
    const version=osrel.match(/^VERSION_ID=([^\n]+)/m)?.[1]?.replaceAll('"','')||'unknown';
    out.os_release=id+' '+version;
    // Playwright resolves executable paths using this process environment at import time.
    process.env.PLAYWRIGHT_BROWSERS_PATH=BROWSERS;
    const pw=requireFromWorker('playwright');
    out.installed_playwright_version=requireFromWorker('playwright/package.json').version;
    const executable=pw.chromium.executablePath();
    out.binary_found=fs.existsSync(executable);
    if(!out.binary_found){
      out.chromium_launch_state='blocked_missing_binary';
      out.chromium_launch_failure_category='pinned_browser_binary_missing';
      return out;
    }
    const ldd=spawnSync('ldd',[executable],{encoding:'utf8',timeout:8000,maxBuffer:64*1024,env:{PATH:process.env.PATH}});
    out.missing_shared_libraries=missingLddNames((ldd.stdout||'')+'\n'+(ldd.stderr||''));
    if(ldd.error||ldd.status!==0){
      out.linker_inspection_state='ldd_failed';
    }else{
      out.linker_inspection_state='passed';
    }
    if(out.missing_shared_libraries.length){
      out.chromium_launch_state='blocked_missing_shared_libraries';
      out.chromium_launch_failure_category='missing_system_shared_libraries';
      return out;
    }
    const probe=[
      "const {chromium}=require('playwright');",
      "(async()=>{const b=await chromium.launch({headless:true,timeout:20000});",
      "process.stdout.write(JSON.stringify({ok:true,version:b.version()}));",
      "await b.close();})().catch(e=>{",
      "process.stderr.write(String(e?.message||e));process.exitCode=1;});"
    ].join('');
    const res=spawnSync(process.execPath,['-e',probe],{
      cwd:SOURCE,encoding:'utf8',timeout:30000,maxBuffer:384*1024,
      env:{
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH:BROWSERS,
        DEBUG:'pw:browser',
        // Avoid passing unrelated operator secret values into a fresh Chrome diagnostic.
        EVERCRAFT_BROWSER_WORKER_TOKEN:'',
        EVERCRAFT_AUTH_BROWSER_OPERATOR_TOKEN:'',
      },
      stdio:['ignore','pipe','pipe'],
    });
    const raw=(res.stderr||'').slice(-32*1024);
    if(res.status===0){
      out.chromium_launch_state='passed';
      out.chromium_version=JSON.parse(res.stdout||'{}').version||null;
    }else{
      out.chromium_launch_state='failed';
      out.chromium_launch_failure_category=classifyChromiumFailure({
        missing:out.missing_shared_libraries,
        log:raw,
        timedOut:res.error?.code==='ETIMEDOUT'||res.signal==='SIGTERM',
      });
      out.relevant_browser_stderr=maskedErrorLines(raw);
      out.exit_code=res.status;
      out.exit_signal=res.signal||null;
    }
  }catch(e){
    out.chromium_launch_state='diagnostic_blocked';
    out.chromium_launch_failure_category='diagnostic_exception';
    out.relevant_browser_stderr=maskedErrorLines(String(e?.message||e));
  }
  return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await diagnose();
  console.log(JSON.stringify(r,null,2));
  if(r.chromium_launch_state!=='passed')process.exitCode=1;
}
