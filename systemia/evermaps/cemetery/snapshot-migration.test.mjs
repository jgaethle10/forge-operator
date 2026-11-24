import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {transferCemeterySnapshot} from './snapshot-dispatch.mjs';
import {createCemeterySnapshotReceiver} from './snapshot-receiver.mjs';
const nodeId='evercraft-node002-nextgen';
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cemetery-migration-proof-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const warehouse=path.join(root,'nextgen');fs.mkdirSync(warehouse,{mode:0o700});
 fs.mkdirSync(path.join(warehouse,'registry'),{mode:0o700});
 const snapshot=path.join(root,'va-gravesite-canary.sqlite3');
 const p=spawnSync('python3',['-I','-c',`import sqlite3,sys
d=sqlite3.connect(sys.argv[1])
d.executescript("CREATE TABLE burials(decedent_id INTEGER PRIMARY KEY); CREATE TABLE checkpoint(id INTEGER PRIMARY KEY,cursor INTEGER); CREATE TABLE receipts(cursor_before INTEGER,cursor_after INTEGER,rows INTEGER);")
d.executemany("INSERT INTO burials VALUES(?)",[(i,) for i in range(967,1217)])
d.execute("INSERT INTO checkpoint VALUES(1,1216)")
d.execute("INSERT INTO receipts VALUES(-1,1216,250)")
d.execute("CREATE TABLE fixture_padding(data BLOB)")
d.execute("INSERT INTO fixture_padding VALUES(zeroblob(60000))")
d.commit();d.close()`,snapshot],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 fs.chmodSync(snapshot,0o600);
 const bytes=fs.readFileSync(snapshot),approvedDigest=sha(bytes);
 const receiver=createCemeterySnapshotReceiver({nodeId,warehouse,approvedDigest,enabled:true});
 const sendJob=async job=>receiver.execute({payload:job.payload,idempotencyKey:job.idempotency_key});
 const args={snapshot,sendJob,authorizedNode:nodeId,confidentialRouteVerified:true,sourceWriterFrozen:true};
 return {warehouse,snapshot,bytes,approvedDigest,receiver,sendJob,args,dest:path.join(warehouse,'registry','va-gravesite-canary.sqlite3')};
}
test('multi-chunk transfer restores exact SQLite checkpoint; repeat does not overwrite',async t=>{
 const f=fixture(t);let chunks=0;
 const sendJob=async j=>{if(j.payload.operation==='stage_chunk')chunks++;return f.sendJob(j)};
 const r=await transferCemeterySnapshot({...f.args,sendJob});
 assert.ok(chunks>1);assert.equal(r.records,250);assert.equal(r.cursor,1216);
 assert.equal(r.writer_handoff_complete,false);assert.deepEqual(fs.readFileSync(f.dest),f.bytes);
 const inode=fs.statSync(f.dest).ino;
 await transferCemeterySnapshot(f.args);assert.equal(fs.statSync(f.dest).ino,inode);
});
test('interruption resumes verified chunks without installing partial snapshot',async t=>{
 const f=fixture(t);let n=0;
 await assert.rejects(transferCemeterySnapshot({...f.args,sendJob:async j=>{if(++n===2)throw Error('fixture interruption');return f.sendJob(j)}}),/interruption/);
 assert.equal(fs.existsSync(f.dest),false);
 const r=await transferCemeterySnapshot(f.args);assert.equal(r.destination_installed,true);
});
test('route and source writer gates reject before transport',async t=>{
 const f=fixture(t);let n=0;const sendJob=async()=>{n++};
 await assert.rejects(transferCemeterySnapshot({...f.args,sendJob,sourceWriterFrozen:false}),/authority/);
 await assert.rejects(transferCemeterySnapshot({...f.args,sendJob,confidentialRouteVerified:false}),/authority/);
 assert.equal(n,0);
});
test('tampered chunk rejected and existing unrelated destination preserved',async t=>{
 const f=fixture(t);
 await assert.rejects(transferCemeterySnapshot({...f.args,sendJob:async j=>{
  if(j.payload.operation==='stage_chunk')j.payload.bytes_base64=Buffer.alloc(24*1024).toString('base64');
  return f.sendJob(j);
 }}),/integrity/);
 assert.equal(fs.existsSync(f.dest),false);
 fs.writeFileSync(f.dest,'existing unrelated data',{mode:0o600});
 await assert.rejects(transferCemeterySnapshot(f.args),/conflict/);
 assert.equal(fs.readFileSync(f.dest,'utf8'),'existing unrelated data');
});
