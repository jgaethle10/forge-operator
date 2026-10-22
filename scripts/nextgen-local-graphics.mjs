#!/usr/bin/env node
// Node002: source-controlled, local-only production canary. No remote job execution.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.resolve(process.env.EVERCRAFT_NEXTGEN_GRAPHICS_STATE || path.join(os.homedir(), '.local/state/evercraft-nextgen-graphics'));
const TASK_INPUTS = [
  'systemia/visual-desk', 'systemia/graphics-command', 'systemia/radar',
  'systemia/worldstate', 'systemia/media-studio',
  'systemia/mcp/fabric-local-runtime.mjs', 'public/visuals',
];
const TESTS = [
  'systemia/visual-desk/factory.test.mjs',
  'systemia/visual-desk/radar-adapter.test.mjs',
  'systemia/visual-desk/transporter.test.mjs',
  'systemia/graphics-command/director.test.mjs',
  'systemia/graphics-command/poster-renderer.test.mjs',
  'systemia/graphics-command/ranking-poster-renderer.test.mjs',
  'systemia/graphics-command/commercial-renderer.test.mjs',
];
const STORY='systemia/visual-desk/stories/washington-active-volcanoes.json';

function hashFiles(root,paths) {
  const files=[];
  function traverse(relative){
    const absolute=path.join(root,relative);
    if(!fs.existsSync(absolute)) throw new Error('required_source_missing:'+relative);
    const info=fs.lstatSync(absolute);
    if(info.isSymbolicLink()) throw new Error('source_symlink_rejected:'+relative);
    if(info.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) traverse(path.join(relative,name));
    } else if(info.isFile()) files.push(relative);
  }
  for(const relative of paths) traverse(relative);
  const digest=crypto.createHash('sha256');
  for(const relative of files.sort()){
    digest.update(relative+'\0');
    digest.update(fs.readFileSync(path.join(root,relative)));
    digest.update('\0');
  }
  return {digest:digest.digest('hex'),file_count:files.length};
}

function writeJson(file,body){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(body,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
}
function readJson(file){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}
function runNode(args,cwd,logFile,timeout=120000){
  const r=spawnSync(process.execPath,args,{
    cwd,encoding:'utf8',timeout,maxBuffer:8*1024*1024,
    env:{...process.env,EVERCRAFT_VISUAL_ORIGIN:'https://preview.invalid/visuals'},
  });
  fs.writeFileSync(logFile,[r.stdout||'',r.stderr||'',r.error?.message||''].join('\n'),{mode:0o600});
  return {exit_code:r.status, signal:r.signal||null, error:r.error?.code||null, passed:r.status===0&&!r.error};
}
function gatePreview(storyDir){
  const poster=readJson(path.join(storyDir,'poster-quality-report.json'));
  const scroll=readJson(path.join(storyDir,'scroll-stop-report.json'));
  const tournament=readJson(path.join(storyDir,'shot-tournament.json'));
  const manifest=readJson(path.join(storyDir,'manifest.json'));
  const clip=readJson(path.join(storyDir,'clip-handoff.json'));
  const plan=readJson(path.join(storyDir,'graphics-plan.json'));
  const required=['poster-feed.svg','poster-square.svg','poster-story.svg','motion.html','clip-handoff.json','index.html'];
  const missing=required.filter(name=>!fs.existsSync(path.join(storyDir,name)));
  const formats=Object.values(poster?.formats||{});
  const pass=Boolean(poster?.status==='pass' && scroll?.status==='pass'
    && tournament?.winnerId && tournament?.candidates?.length>=2
    && formats.length===3 && formats.every(f=>f.status==='pass')
    && Boolean(manifest?.storyDigest)
    && poster?.publicationAuthority===false
    && scroll?.publicationAuthority===false
    && tournament?.publicationAuthority===false
    && plan?.publicationAuthority===false
    && clip?.publicationAuthority===false
    && missing.length===0);
  return {
    pass,
    missing,
    poster_quality:poster?.status||'missing',
    scroll_stop:scroll?.status||'missing',
    shot_tournament_winner:tournament?.winnerId||null,
    format_count:formats.length,
    publication_authority:false,
  };
}
function getCommit(){
  const r=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',timeout:5000});
  return r.status===0 ? r.stdout.trim() : null;
}
function locallyReady(){
  for(const f of [...TESTS,STORY,'systemia/visual-desk/build-all.mjs']){
    if(!fs.existsSync(path.join(ROOT,f)))throw new Error('full_repository_required:'+f);
  }
}
function main(){
  const force=process.argv.includes('--force');
  const status=process.argv.includes('--status');
  if(process.argv.some(x=>x.startsWith('--')&&!['--force','--status'].includes(x)))throw new Error('unsupported_argument');
  if(status){console.log(JSON.stringify(readJson(path.join(STATE,'last-attempt.json'))||{state:'never_run'},null,2));return;}
  locallyReady();
  const {digest,file_count}=hashFiles(ROOT,TASK_INPUTS);
  fs.mkdirSync(STATE,{recursive:true,mode:0o700});
  const last=readJson(path.join(STATE,'last-attempt.json'));
  if(!force && last?.source_digest===digest){
    console.log(JSON.stringify({state:'unchanged',source_digest:digest,last_run:last.run_id,last_status:last.status,previous_receipt:last.receipt_path},null,2));
    return;
  }
  const start=new Date().toISOString();
  const root=fs.mkdtempSync(path.join(STATE,'run-'));
  const runId=path.basename(root);
  const storyInput=path.join(root,'input');
  const output=path.join(root,'site');
  fs.mkdirSync(storyInput,{recursive:true,mode:0o700});
  fs.copyFileSync(path.join(ROOT,STORY),path.join(storyInput,path.basename(STORY)));
  const test=runNode(['--test',...TESTS],ROOT,path.join(root,'tests.log'));
  const build=test.passed ? runNode([
    'systemia/visual-desk/build-all.mjs',storyInput,output,'https://preview.invalid/visuals',
  ],ROOT,path.join(root,'build.log')) : {passed:false,exit_code:null,reason:'tests_failed'};
  const gates=build.passed ? gatePreview(path.join(output,'washington-active-volcanoes')) : {pass:false,reason:'build_not_ready'};
  const ok=test.passed&&build.passed&&gates.pass;
  const receipt={
    schema:'evercraft.nextgen.local-graphics-receipt.v1',
    node_id:'evercraft-node002-nextgen',
    run_id:runId,
    source_commit:getCommit(),
    source_digest:digest,
    source_file_count:file_count,
    started_at:start,
    completed_at:new Date().toISOString(),
    status:ok?'pass':'fail_closed',
    tests:test,
    build,
    quality_gates:gates,
    output_directory:output,
    publication_authority:false,
    remote_job_execution:false,
    remote_control_granted:false,
    external_publish_performed:false,
    receipt_signature_state:'unsigned_local',
  };
  writeJson(path.join(root,'receipt.json'),receipt);
  writeJson(path.join(STATE,'last-attempt.json'),{
    run_id:runId,status:receipt.status,source_digest:digest,
    receipt_path:path.join(root,'receipt.json'),completed_at:receipt.completed_at,
  });
  console.log(JSON.stringify(receipt,null,2));
  if(!ok)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(e){console.error(JSON.stringify({state:'failed_closed',error:e.message}));process.exitCode=1;}
}
export {hashFiles,gatePreview};
