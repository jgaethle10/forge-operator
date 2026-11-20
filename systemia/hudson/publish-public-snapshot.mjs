#!/usr/bin/env node
/**
 * HUDSON's narrow public Git-history publisher.
 * Never emits commit messages, source content, customer data, secrets, or private receipts.
 * Run only on Evercraft-owned infrastructure under Systemia approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync,execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'evercraft.hudson.public-activity.v1';
export const CANONICAL = 'https://github.com/jgaethle10/forge-operator';
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '../..');
const defaultOut = path.join(defaultRoot, 'public/hudson/activity.json');
const approvedRemote = /^(?:https:\/\/github\.com\/jgaethle10\/forge-operator(?:\.git)?|git@github\.com:jgaethle10\/forge-operator(?:\.git)?)\/?$/i;

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 3_000_000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}
export function classifyPaths(paths) {
  if (!Array.isArray(paths)) return null;
  const all = paths.filter(p => typeof p === 'string');
  if (all.some(p => /^systemia\/hudson\/|^public\/hudson\//.test(p))) return 'hudson';
  if (all.some(p => /^systemia\/(?:continuity|launch-governance)\//.test(p))) return 'kaidance';
  if (all.some(p => /^systemia\/(?:raven|signal-fabric|notification-fabric|network)\//.test(p))) return 'raven';
  if (all.some(p => /^systemia\/(?:saban|remote-operator)\//.test(p) || /^public\/work-saban\//.test(p))) return 'saban';
  if (all.some(p => /^systemia\/(?:lineage|proof-factory|forensic-record)\//.test(p) || /^public\/lineage\//.test(p))) return 'evidence';
  if (all.some(p => /^systemia\/(?:research|radar|opportunity-fabric)\//.test(p) || /^public\/(?:chum|journal|radar)\//.test(p))) return 'discovery';
  if (all.some(p => /^systemia\//.test(p) || /^public\//.test(p))) return 'systemia';
  return null;
}
export function makePublicSnapshot({entries, publishedAt = new Date().toISOString(), limit = 60, lookbackHours = 72} = {}) {
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error('invalid_publication_time');
  const now = Date.parse(publishedAt), min = now - Math.max(1, Math.min(720,lookbackHours)) * 3600000;
  const titles = {
    hudson:'HUDSON source lineage updated',
    systemia:'Evercraft orchestration source updated',
    kaidance:'Continuity source updated',
    raven:'Communications source updated',
    saban:'Execution coordination source updated',
    evidence:'Evidence and provenance source updated',
    discovery:'Public discovery source updated'
  };
  const seen=new Set(),events=[];
  for (const row of entries || []) {
    const sha=String(row?.sha||''),at=String(row?.at||''),ts=Date.parse(at),system=classifyPaths(row?.paths);
    if (!/^[0-9a-f]{40}$/i.test(sha)||!Number.isFinite(ts)||ts>now+120000||ts<min||!system||seen.has(sha)) continue;
    seen.add(sha);
    events.push({
      id:sha,at:new Date(ts).toISOString(),system,kind:'public_git_source_change',
      title:titles[system],source_url:CANONICAL+'/commit/'+sha,
      public:true,source_verified:true
    });
  }
  events.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
  return {
    schema:SCHEMA,status:'connected',published_at:new Date(now).toISOString(),
    coverage:'public_git_history_only_not_total_hudson_activity',
    sources:[{id:'evercraft-git',label:'Evercraft public canonical Git history'}],
    events:events.slice(0,Math.max(1,Math.min(200,limit)))
  };
}
export function parsePublicGitLog(raw) {
  const result=[];
  let current=null;
  for (const line of String(raw||'').split('\n')) {
    const value=line.trim();
    const match=/^([a-f0-9]{40})\x1f([^\x1f]+)$/i.exec(value);
    if(match){
      current={sha:match[1],at:match[2],paths:[]};
      result.push(current);
    }else if(value&&current&&!value.includes('\x00')){
      current.paths.push(value);
    }
  }
  return result;
}
function runGitAsync(root,args){
  return new Promise((resolve,reject)=>{
    execFile('git',['-C',root,...args],{
      encoding:'utf8',timeout:12_000,maxBuffer:3_000_000,
    },(error,stdout)=>error?reject(error):resolve(String(stdout||'').trim()));
  });
}
export async function gatherGitEntriesAsync(root,max=80){
  const origin=await runGitAsync(root,['remote','get-url','origin']);
  if(!approvedRemote.test(origin))throw Error('wrong_canonical_public_repository');
  const records=await runGitAsync(root,[
    'log','--no-merges','-n',String(Math.max(1,Math.min(200,max))),
    '--format=%H%x1f%cI','--name-only'
  ]);
  return parsePublicGitLog(records);
}
export function gatherGitEntries(root,max=80) {
  const origin=runGit(root,['remote','get-url','origin']);
  if (!approvedRemote.test(origin)) throw new Error('wrong_canonical_public_repository');
  const records=runGit(root,[
    'log','--no-merges','-n',String(Math.max(1,Math.min(200,max))),
    '--format=%H%x1f%cI','--name-only'
  ]);
  return parsePublicGitLog(records);
}
function arg(name,fallback) {
  const i=process.argv.indexOf(name);
  if (i<0) return fallback;
  if (!process.argv[i+1]||process.argv[i+1].startsWith('--')) throw new Error('missing_argument_'+name);
  return process.argv[i+1];
}
export function writeSnapshot(out,snapshot) {
  const resolved=path.resolve(out);
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  const tmp=resolved+'.'+process.pid+'.tmp';
  try {
    fs.writeFileSync(tmp,JSON.stringify(snapshot,null,2)+'\n',{mode:0o644,flag:'wx'});
    fs.renameSync(tmp,resolved);
  } finally {try{fs.unlinkSync(tmp)}catch{}}
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const root=path.resolve(arg('--repo',defaultRoot)),out=path.resolve(arg('--out',defaultOut));
    const limit=Number(arg('--limit','60')),lookbackHours=Number(arg('--lookback-hours','72'));
    if (!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(lookbackHours)||lookbackHours<1||lookbackHours>720) throw new Error('invalid_bounds');
    const snapshot=makePublicSnapshot({entries:gatherGitEntries(root),limit,lookbackHours});
    writeSnapshot(out,snapshot);
    process.stdout.write(JSON.stringify({ok:true,schema:SCHEMA,status:snapshot.status,events:snapshot.events.length,source:snapshot.sources[0].id,out})+'\n');
  } catch(e) {
    process.stderr.write('hudson_public_publisher_failed: '+String(e?.message||e)+'\n');
    process.exitCode=1;
  }
}
