#!/usr/bin/env node
// Evercraft RustGIS bounded worker v1: locally invoked, detached signed permit,
// synthetic-only data, no shell, no network commands, no MCP --yes.
import { readFile, realpath, lstat, mkdir, open, writeFile } from 'node:fs/promises';
import { createHash, verify as verifySignature } from 'node:crypto';
import { spawn } from 'node:child_process';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export class Hold extends Error { constructor(code, message) { super(message); this.code = code; } }
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,110}$/;
const SAFE_JOB = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/;
const SCHEMA = 'evercraft.rustgis.job.v1';
const ALLOWED_JOB_KEYS = new Set(['schema','job_id','mission_key','target_node_id','issued_at','expires_at','nonce','operation','dataset','dataset_sha256','expected_binary_sha256','synthetic_only']);

export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
export function sha(data) { return createHash('sha256').update(data).digest('hex'); }
function requireState(condition, code, message) { if (!condition) throw new Hold(code, message); }
function exactString(v) { return typeof v === 'string' && v.length > 0; }
function hasSha(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }
function isContained(root, p) { return p.startsWith(root + sep); }
async function readConfinedFile(root, filename) {
  requireState(SAFE_NAME.test(filename) && !filename.includes('..'), 'UNSAFE_NAME', 'Refuse ambiguous file name');
  const located = resolve(root, filename);
  requireState(isContained(root, located), 'ESCAPE_BLOCKED', 'Path outside approved input root');
  const fileStat = await lstat(located);
  requireState(fileStat.isFile() && !fileStat.isSymbolicLink(), 'SYMLINK_BLOCKED', 'Source must be a regular non-symlink file');
  const actual = await realpath(located);
  requireState(isContained(root, actual), 'ESCAPE_BLOCKED', 'Source resolves outside input root');
  requireState(fileStat.size > 1 && fileStat.size < 10 * 1024 * 1024, 'FILE_SIZE', 'Source over 10 MiB or empty');
  return { path: actual, bytes: await readFile(actual) };
}
function validateGeojson(bytes) {
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Hold('GEOJSON_INVALID', 'Input is not JSON'); }
  requireState(data?.type === 'FeatureCollection' && Array.isArray(data.features), 'GEOJSON_INVALID', 'Must be FeatureCollection');
  requireState(data.features.length >= 1 && data.features.length <= 1000, 'FEATURE_BOUNDS', 'Unexpected feature count');
  requireState(['synthetic_test_only','synthetic'].includes(data.metadata?.data_state), 'REAL_DATA_HELD', 'v1 only accepts explicitly synthetic fixtures');
  let coordinates = 0;
  function checkCoords(node, depth=0) {
    requireState(depth <= 12, 'GEOJSON_DEPTH', 'Excessive geometry nesting');
    requireState(Array.isArray(node), 'GEOJSON_INVALID', 'Coordinates not an array');
    if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      requireState(node.length <= 3 && Number.isFinite(node[0]) && Number.isFinite(node[1]) && Math.abs(node[0]) <= 180 && Math.abs(node[1]) <= 90, 'COORD_INVALID', 'Coordinate bounds invalid');
      coordinates++; return;
    }
    for (const n of node) checkCoords(n, depth + 1);
  }
  for (const feat of data.features) {
    requireState(feat?.type === 'Feature' && feat.properties?.synthetic === true, 'REAL_DATA_HELD', 'v1 only accepts synthetic features');
    requireState(['Polygon','MultiPolygon','Point','MultiPoint','LineString','MultiLineString'].includes(feat.geometry?.type), 'GEOMETRY_UNSUPPORTED', 'Unsupported geometry');
    checkCoords(feat.geometry.coordinates);
  }
  requireState(coordinates < 100000, 'COORD_LIMIT', 'Too many coordinates');
  return { features: data.features.length, coordinates };
}
function validateJob(j,c) {
  requireState(j && typeof j==='object' && !Array.isArray(j), 'JOB_SCHEMA', 'Invalid job');
  requireState(Object.keys(j).every(k=>ALLOWED_JOB_KEYS.has(k)), 'JOB_SCHEMA', 'Unknown job field');
  requireState(j.schema===SCHEMA, 'JOB_SCHEMA', 'Unexpected schema');
  requireState(SAFE_JOB.test(j.job_id) && SAFE_JOB.test(j.nonce), 'JOB_ID', 'Unsafe job ID / nonce');
  requireState(j.target_node_id===c.node_id && exactString(c.node_id), 'WRONG_NODE', 'Job not addressed to this worker');
  requireState(j.mission_key===c.mission_key && exactString(c.mission_key), 'WRONG_MISSION', 'Job not routed through configured Systemia mission');
  requireState(j.synthetic_only===true, 'REAL_DATA_HELD', 'Synthetic-only worker');
  requireState(['render','buffer_100m'].includes(j.operation), 'OPERATION_DENIED', 'Operation is not allowlisted');
  requireState(/^canary_(narrow|baseline|wide)\.geojson$/.test(j.dataset), 'DATASET_DENIED', 'Only immutable canary fixture names supported');
  requireState(hasSha(j.dataset_sha256) && hasSha(j.expected_binary_sha256), 'SHA_INVALID', 'Missing input or binary hash');
  requireState(Number.isFinite(Date.parse(j.issued_at)) && Number.isFinite(Date.parse(j.expires_at)), 'TIME_INVALID', 'Invalid permit dates');
  const n=Date.now(),t1=Date.parse(j.issued_at),t2=Date.parse(j.expires_at);
  requireState(t1<=n+60000 && t2>=n && t2-t1<=15*60*1000 && t2>t1, 'EXPIRED', 'Permit expired or valid too long');
}
function run(bin,args,work,timeoutMs) {
  return new Promise((resolveRun,reject)=> {
    const child=spawn(bin,args,{cwd:work,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:work,XDG_CACHE_HOME:work},shell:false,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',ended=false,tooLarge=false;
    const timeout=setTimeout(()=>{ child.kill('SIGKILL'); tooLarge=false; },timeoutMs);
    const capture=(buf,target)=>{const s=buf.toString('utf8');if(target==='stdout') stdout+=s;else stderr+=s;if(stdout.length+stderr.length>150000){tooLarge=true;child.kill('SIGKILL');}};
    child.stdout.on('data',b=>capture(b,'stdout'));child.stderr.on('data',b=>capture(b,'stderr'));
    child.on('error',e=>{clearTimeout(timeout);if(!ended){ended=true;reject(new Hold('ENGINE_START',e.message));}});
    child.on('close',(code,signal)=>{clearTimeout(timeout);if(!ended){ended=true;if(code!==0 || tooLarge)reject(new Hold('ENGINE_FAIL',`engine exit=${code} signal=${signal} stderr=${stderr.slice(0,400)}`));else resolveRun({stdout,stderr});}});
  });
}
async function validatedEngine(config,job) {
  const p=await realpath(config.rustgis_binary);
  const meta=await lstat(p);
  requireState(meta.isFile()&&!meta.isSymbolicLink(), 'ENGINE_UNSAFE', 'Binary symlink or not a file');
  const actualHash=sha(await readFile(p));
  requireState(actualHash===config.pinned_binary_sha256 && actualHash===job.expected_binary_sha256,'ENGINE_HASH','RustGIS executable hash mismatch');
  return p;
}
export async function execute({configPath, jobPath, permitPath}) {
  const conf=JSON.parse(await readFile(configPath,'utf8'));
  requireState(conf.schema==='evercraft.rustgis.worker-config.v1' && conf.remote_jobs_enabled===false, 'REMOTE_DISABLED', 'Only locally triggered synthetic canary allowed');
  requireState(conf.mode==='isolated_canary' && conf.node_id && conf.mission_key && hasSha(conf.pinned_binary_sha256), 'CONFIG_HELD', 'Bad worker configuration');
  const job=JSON.parse(await readFile(jobPath,'utf8'));
  validateJob(job,conf);
  const permit=JSON.parse(await readFile(permitPath,'utf8'));
  requireState(permit?.schema==='evercraft.rustgis.permit.v1' && permit.job_id===job.job_id && typeof permit.signature==='string', 'PERMIT_SCHEMA', 'Permit mismatch');
  const pub=await readFile(conf.trusted_public_key_path,'utf8');
  let valid=false;
  try { valid=verifySignature(null,Buffer.from(stable(job)),pub,Buffer.from(permit.signature,'base64')); } catch { valid=false; }
  requireState(valid,'SIGNATURE_DENIED','Permit signature invalid');
  const inputRoot=await realpath(conf.input_root),outputRoot=await realpath(conf.output_root),ledgerRoot=await realpath(conf.ledger_root);
  requireState(inputRoot!==outputRoot && inputRoot!==ledgerRoot && outputRoot!==ledgerRoot, 'ROOT_COLLISION', 'Worker roots overlap');
  const dataset=await readConfinedFile(inputRoot,job.dataset);
  requireState(sha(dataset.bytes)===job.dataset_sha256,'DATA_HASH','Source hash mismatch');
  const meta=validateGeojson(dataset.bytes);
  const binary=await validatedEngine(conf,job);
  requireState(Number.isInteger(conf.timeout_ms)&&conf.timeout_ms>=500&&conf.timeout_ms<=60000, 'CONFIG_HELD', 'Timeout not bounded');
  const lockPath=join(ledgerRoot,job.nonce+'.lock');
  let lock;
  try { lock=await open(lockPath,'wx',0o600);await lock.writeFile(JSON.stringify({job_id:job.job_id,nonce:job.nonce,at:new Date().toISOString()}));await lock.close(); }
  catch(e){if(e.code==='EEXIST')throw new Hold('REPLAY_DENIED','Nonce already consumed; inspect before retry');throw e;}
  const out=join(outputRoot,job.job_id);
  let state='failed',outputs=[],engineStderr=[],createdOutput=false;
  try {
    await mkdir(out,{mode:0o700});
    createdOutput=true;
    if(job.operation==='render') {
      const info=await run(binary,['info',dataset.path],out,conf.timeout_ms);
      const parsed=JSON.parse(info.stdout);
      requireState(parsed.layers?.some(l=>l.features===meta.features),'INFO_MISMATCH','RustGIS feature count mismatch');
      const pic=await run(binary,['render',dataset.path,join(out,'map.png'),'--width','640','--height','420'],out,conf.timeout_ms);
      engineStderr.push(info.stderr,pic.stderr);
      const png=await readFile(join(out,'map.png'));
      requireState(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && png.readUInt32BE(16)===640 && png.readUInt32BE(20)===420,'RENDER_INVALID','Output not expected PNG');
      outputs=[{file:'map.png',size:png.length,sha256:sha(png)}];
    } else {
      const name=basename(dataset.path,'.geojson');
      const cmd='gp.run='+JSON.stringify({tool:'buffer',params:{input:name,distance:100,units:'Meters',dissolve:'None',output:'synthetic_100m_buffer'}});
      const res=await run(binary,['run','--no-plugins','--data',dataset.path,'--cmd',cmd,'--save',join(out,'buffered.rgis')],out,conf.timeout_ms);
      const info=await run(binary,['info',join(out,'buffered.rgis')],out,conf.timeout_ms);
      engineStderr.push(res.stderr,info.stderr);
      const parsed=JSON.parse(info.stdout);
      requireState(parsed.layers?.length>=2 && parsed.layers.some(l=>l.name==='synthetic_100m_buffer' && l.features===meta.features),'BUFFER_INVALID','Buffered project missing expected named result and feature count');
      const p=await readFile(join(out,'buffered.rgis'));
      outputs=[{file:'buffered.rgis',size:p.length,sha256:sha(p)}];
    }
    state='verified';
  } catch(e) { state='failed';engineStderr.push(e instanceof Error ? e.message:String(e));throw e; }
  finally {
    const receipt={schema:'evercraft.rustgis.worker-receipt.v1',job_id:job.job_id,mission_key:job.mission_key,nonce:job.nonce,operation:job.operation,state,synthetic_only:true,source_sha256:sha(dataset.bytes),binary_sha256:job.expected_binary_sha256,feature_count:meta.features,artifacts:outputs,observed_at_utc:new Date().toISOString(),evidence_level:'locally-verified-not-production',stderr_summary:engineStderr.join('\n').slice(0,1000)};
    // A repeated job id with a different nonce must never overwrite an older receipt.
    if(createdOutput) await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  }
  return JSON.parse(await readFile(join(out,'receipt.json'),'utf8'));
}
async function main(){
  if(process.argv[2]!=='execute'||process.argv.length!==6)throw new Hold('USAGE','Usage: node worker.mjs execute CONFIG.json JOB.json PERMIT.json');
  const r=await execute({configPath:process.argv[3],jobPath:process.argv[4],permitPath:process.argv[5]});
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error(JSON.stringify({status:'held',code:e.code||'UNEXPECTED_ERROR',message:e.message}));process.exitCode=2;});
}
