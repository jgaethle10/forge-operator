#!/usr/bin/env node
/**
 * EO-001 resident, owned-machine scheduling manifest.
 *
 * Local opt-in preparation only. Writes user-systemd unit files on explicit
 * --write-units; NEVER enables, starts, restarts or reconfigures any service.
 * Uses only the existing NextGen checkout and a narrowly bounded local QA
 * goal runner. No network, original-agent enrollment, privileged remote jobs,
 * Systemia authority expansion, or external messages.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const serviceName='evercraft-eo001-owned-qa.service';
const timerName='evercraft-eo001-owned-qa.timer';
const safePath=p=>typeof p==='string'&&p.startsWith('/')&&
  /^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(p);
function requirePath(p,label){if(!safePath(p))throw Error(label+'_unsafe_path');return p;}
export function renderEo001ResidentUnits({home,sourceRoot,nodeBinary}={}){
  requirePath(home,'home');
  requirePath(sourceRoot,'source_root');
  requirePath(nodeBinary,'node_binary');
  const handoff=path.join(home,'.local/state/evercraft/eo001-handoff');
  const mission=path.join(sourceRoot,'systemia/organism/eo001-owned-qa-mission.mjs');
  return {
    [serviceName]: `[Unit]
Description=Evercraft EO-001 bounded private Forge QA mission
Documentation=https://github.com/jgaethle10/forge-operator/pull/1937
ConditionPathExists=${handoff}

[Service]
Type=oneshot
WorkingDirectory=${sourceRoot}
ExecStart=${nodeBinary} ${mission}
Environment=HOME=${home}
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${handoff}
RestrictAddressFamilies=AF_UNIX
UMask=0077
TimeoutStartSec=60
`,
    [timerName]: `[Unit]
Description=Evercraft EO-001 private QA pickup (owned Node002 only)

[Timer]
OnActiveSec=90s
OnUnitInactiveSec=5min
AccuracySec=30s
Unit=${serviceName}
Persistent=true

[Install]
WantedBy=timers.target
`
  };
}
function safeDirectory(dir,{privateAccess=false}={}){
  const s=fs.lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||
      (typeof process.getuid==='function'&&s.uid!==process.getuid())||
      (privateAccess&&(s.mode&0o077)!==0))
    throw Error('owned_directory_required');
}
export function writeEo001ResidentUnits({home,sourceRoot,nodeBinary,write=false}={}){
  const units=renderEo001ResidentUnits({home,sourceRoot,nodeBinary});
  const base=path.join(home,'.local/state/evercraft/eo001-handoff');
  safeDirectory(base,{privateAccess:true});
  safeDirectory(sourceRoot);
  const mission=path.join(sourceRoot,'systemia/organism/eo001-owned-qa-mission.mjs');
  if(!fs.existsSync(mission)||!fs.statSync(mission).isFile())throw Error('mission_source_not_present');
  if(!fs.existsSync(nodeBinary)||!fs.statSync(nodeBinary).isFile())throw Error('node_binary_not_present');
  const unitDir=path.join(home,'.config/systemd/user');
  const targets=Object.keys(units).map(name=>path.join(unitDir,name));
  if(!write)return {state:'SOURCE_READY_NOT_INSTALLED',units:Object.keys(units),
    enabled:false,started:false,service_changes:false,remote_jobs_changed:false};
  fs.mkdirSync(unitDir,{recursive:true,mode:0o700});
  safeDirectory(unitDir);
  for(const target of targets)if(fs.existsSync(target))throw Error('unit_already_exists_no_overwrite');
  const created=[];
  try{
    for(const [name,data] of Object.entries(units)){
      const target=path.join(unitDir,name);
      fs.writeFileSync(target,data,{flag:'wx',mode:0o600});
      created.push(target);
    }
  }catch(e){
    for(const target of created)fs.unlinkSync(target);
    throw e;
  }
  return {state:'UNIT_FILES_WRITTEN_NOT_ACTIVATED',units:Object.keys(units),
    enabled:false,started:false,service_changes:false,remote_jobs_changed:false};
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){
  try{
    const home=os.homedir();
    const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
    const result=writeEo001ResidentUnits({
      home,sourceRoot,nodeBinary:process.execPath,
      write:process.argv.includes('--write-units')
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(e){
    process.stderr.write(JSON.stringify({state:'RESIDENT_UNIT_PREPARATION_BLOCKED',
      enabled:false,started:false,reason:String(e?.message||'unknown')})+'\n');
    process.exitCode=2;
  }
}
