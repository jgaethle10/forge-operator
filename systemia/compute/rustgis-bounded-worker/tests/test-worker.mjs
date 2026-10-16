import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execute, stable, sha } from '../src/worker.mjs';
const root=await mkdtemp(join(tmpdir(),'evercraft-rustgis-worker-test-'));
const fixtures=resolve(import.meta.dirname,'../fixtures');
const inputs=join(root,'inputs'),outputs=join(root,'outputs'),ledger=join(root,'ledger');
for (const d of [inputs,outputs,ledger]) await mkdir(d);
for (const s of ['narrow','baseline','wide']) await copyFile(join(fixtures,`canary_${s}.geojson`),join(inputs,`canary_${s}.geojson`));
const source=await readFile(join(inputs,'canary_baseline.geojson'));
const {privateKey, publicKey}=generateKeyPairSync('ed25519');
await writeFile(join(root,'public.pem'),publicKey.export({type:'spki',format:'pem'}));
const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):(c>>>1);crcTable[n]=c>>>0;}
const crc=b=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(kind,data){const name=Buffer.from(kind);const len=Buffer.alloc(4),check=Buffer.alloc(4);len.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([len,name,data,check]);}
const header=Buffer.alloc(13);header.writeUInt32BE(640);header.writeUInt32BE(420,4);header[8]=8;header[9]=6;
const pixels=Buffer.alloc(420*(640*4+1));
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels,{level:6})),chunk('IEND',Buffer.alloc(0))]);
await writeFile(join(root,'sample.png'),png);
const binary=join(root,'rustgis-cli');
const mock=`#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);const output=(v)=>process.stdout.write(JSON.stringify(v)+'\\n');
if(args[0]==='info'){const result=args[1].endsWith('.rgis')?[{name:'synthetic_100m_buffer',features:41},{name:'canary_baseline',features:41}]:[{name:'canary_baseline',features:41}];output({layers:result});}
else if(args[0]==='render'){fs.copyFileSync(${JSON.stringify(join(root,'sample.png'))},args[2]);output({bytes:fs.statSync(args[2]).size});}
else if(args[0]==='run' && args.includes('--no-plugins')){const idx=args.indexOf('--save');if(idx<0)process.exit(3);fs.writeFileSync(args[idx+1],Buffer.from('synthetic-test-project'));output({layer:2});}
else process.exit(8);
`;
await writeFile(binary,mock,{mode:0o700});await chmod(binary,0o700);
const now=Date.now();
const config={schema:'evercraft.rustgis.worker-config.v1',mode:'isolated_canary',remote_jobs_enabled:false,node_id:'evercraft-node002-nextgen-CANARY',mission_key:'evercraft-rustgis-geospatial-engine-evaluation-20261013',rustgis_binary:binary,pinned_binary_sha256:sha(await readFile(binary)),input_root:inputs,output_root:outputs,ledger_root:ledger,trusted_public_key_path:join(root,'public.pem'),timeout_ms:10000};
const confPath=join(root,'config.json');await writeFile(confPath,JSON.stringify(config));
let serial=1,passed=0,failed=0;
function jobFor(op='render'){const n=serial++;return {schema:'evercraft.rustgis.job.v1',job_id:`canary-${n}`,mission_key:config.mission_key,target_node_id:config.node_id,issued_at:new Date(now).toISOString(),expires_at:new Date(now+120000).toISOString(),nonce:`nonce-${n}`,operation:op,dataset:'canary_baseline.geojson',dataset_sha256:sha(source),expected_binary_sha256:config.pinned_binary_sha256,synthetic_only:true};}
async function run(j, {cfg=config, tamperSignature=false}={}) {
  const sig=sign(null,Buffer.from(stable(tamperSignature?{...j,mission_key:'wrong'}:j)),privateKey).toString('base64');
  const path=join(root,`${j.job_id}.json`),permitPath=join(root,`${j.job_id}.permit.json`),cPath=join(root,`${j.job_id}.config.json`);
  await writeFile(path,JSON.stringify(j));await writeFile(permitPath,JSON.stringify({schema:'evercraft.rustgis.permit.v1',job_id:j.job_id,signature:sig}));await writeFile(cPath,JSON.stringify(cfg));
  return execute({jobPath:path,permitPath,configPath:cPath});
}
async function test(label,fn){try{await fn();passed++;console.log('PASS',label);}catch(e){failed++;console.error('FAIL',label,e.code||'',e.message);}}
async function rejectCode(j,code,opts){await assert.rejects(()=>run(j,opts),e=>e.code===code);}
await test('signed render, hash checking, actual PNG output and receipt',async()=>{let r=await run(jobFor());assert.equal(r.state,'verified');assert.equal(r.feature_count,41);assert.equal(r.artifacts[0].file,'map.png');assert.equal(r.artifacts[0].sha256,sha(png));});
await test('signed spatial 100m buffer and project output',async()=>{let r=await run(jobFor('buffer_100m'));assert.equal(r.state,'verified');assert.equal(r.artifacts[0].file,'buffered.rgis');});
await test('buffer cannot pass using the untouched original layer alone',async()=>{
  const altered=mock.replace("{name:'synthetic_100m_buffer',features:41}","{name:'unrelated_layer',features:41}");
  const badBinary=join(root,'bad-buffer-cli');
  await writeFile(badBinary,altered,{mode:0o700}); await chmod(badBinary,0o700);
  const newHash=sha(await readFile(badBinary));
  const cfg={...config,rustgis_binary:badBinary,pinned_binary_sha256:newHash};
  await rejectCode({...jobFor('buffer_100m'),expected_binary_sha256:newHash},'BUFFER_INVALID',{cfg});
});
await test('duplicate job id with fresh nonce cannot overwrite prior verified receipt',async()=>{
  const original=jobFor();await run(original);
  const receiptPath=join(outputs,original.job_id,'receipt.json');
  const before=await readFile(receiptPath);
  const collision={...jobFor(),job_id:original.job_id};
  await assert.rejects(()=>run(collision));
  assert.deepEqual(await readFile(receiptPath),before);
});
await test('refuse replayed signed nonce',async()=>{const j=jobFor();await run(j);await rejectCode(j,'REPLAY_DENIED');});
await test('reject invalid signature',async()=>rejectCode(jobFor(),'SIGNATURE_DENIED',{tamperSignature:true}));
await test('reject wrong node',async()=>rejectCode({...jobFor(),target_node_id:'evil'},'WRONG_NODE'));
await test('reject wrong mission',async()=>rejectCode({...jobFor(),mission_key:'elsewhere'},'WRONG_MISSION'));
await test('reject unsupported command',async()=>rejectCode({...jobFor(),operation:'shell.exec'},'OPERATION_DENIED'));
await test('reject unapproved dataset/path traversal',async()=>rejectCode({...jobFor(),dataset:'../secret.geojson'},'DATASET_DENIED'));
await test('reject source hash mismatch',async()=>rejectCode({...jobFor(),dataset_sha256:'0'.repeat(64)},'DATA_HASH'));
await test('reject binary checksum mismatch',async()=>rejectCode({...jobFor(),expected_binary_sha256:'a'.repeat(64)},'ENGINE_HASH'));
await test('reject expiry',async()=>rejectCode({...jobFor(),expires_at:new Date(now-1).toISOString()},'EXPIRED'));
await test('reject overlong permit expiry',async()=>rejectCode({...jobFor(),expires_at:new Date(now+60*60*1000).toISOString()},'EXPIRED'));
await test('reject unknown job field',async()=>rejectCode({...jobFor(),arbitrary_shell_command:'rm -rf /'},'JOB_SCHEMA'));
await test('reject non-synthetic job',async()=>rejectCode({...jobFor(),synthetic_only:false},'REAL_DATA_HELD'));
await test('refuse remote enabled configuration',async()=>rejectCode(jobFor(),'REMOTE_DISABLED',{cfg:{...config,remote_jobs_enabled:true}}));
await test('refuse absent mission in configuration',async()=>rejectCode(jobFor(),'CONFIG_HELD',{cfg:{...config,mission_key:null}}));
await test('reject symlinked input files',async()=>{const orig=join(inputs,'canary_baseline.geojson'),alt=join(inputs,'actual.geojson');await copyFile(orig,alt);const old=join(inputs,'canary_baseline.backup');await copyFile(orig,old);const {rename,unlink}=await import('node:fs/promises');await rename(orig,orig+'.save');await symlink(alt,orig);try{await rejectCode(jobFor(),'SYMLINK_BLOCKED');}finally{await unlink(orig);await rename(orig+'.save',orig);}});
await test('correctly reject source real data',async()=>{const {rename}=await import('node:fs/promises');const orig=join(inputs,'canary_baseline.geojson'),backup=orig+'.save';await rename(orig,backup);const dat=JSON.parse(source);dat.metadata.data_state='observed';const b=Buffer.from(JSON.stringify(dat));await writeFile(orig,b);try{await rejectCode({...jobFor(),dataset_sha256:sha(b)},'REAL_DATA_HELD');}finally{await rename(backup,orig);}});
console.log(JSON.stringify({passed,failed,unit_test_environment:'mock-RustGIS-binary-not-real',ephemeral_test_private_key_not_exported:true},null,2));
if(failed)process.exitCode=1;
