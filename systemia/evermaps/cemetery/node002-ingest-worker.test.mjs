import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCemeteryNodeWorker,validateCemeteryRequest} from './node002-ingest-worker.mjs';
const nodeId='evercraft-node002-nextgen';
const payload={schema:'evercraft.evermaps.cemetery-node002-request.v1',operation:'ingest_batch'};
function fixture(t){
 const warehouse=fs.mkdtempSync(path.join(os.tmpdir(),'cemetery-node002-'));
 t.after(()=>fs.rmSync(warehouse,{recursive:true,force:true}));
 for(const d of ['registry','receipts'])fs.mkdirSync(path.join(warehouse,d),{mode:0o700});
 fs.writeFileSync(path.join(warehouse,'registry','va-gravesite-canary.sqlite3'),'synthetic fixture',{mode:0o600});
 return warehouse;
}
test('exact node, opt-in and payload scope required',t=>{
 const warehouse=fixture(t);
 assert.throws(()=>createCemeteryNodeWorker({nodeId:'penguin',warehouse}),/scope/);
 assert.throws(()=>createCemeteryNodeWorker({nodeId,warehouse}).execute({payload,idempotencyKey:'test-job-0001'}),/disabled/);
 assert.throws(()=>validateCemeteryRequest({...payload,url:'https://example.invalid'}),/denied/);
 assert.throws(()=>validateCemeteryRequest({...payload,operation:'shell'}),/denied/);
});
test('bounded completion receipt is reused, conflicting replay refused',t=>{
 const warehouse=fixture(t);let calls=0;
 const spawn=(cmd,args)=>{calls++;assert.equal(cmd,'python3');return {status:0,stdout:args[0]==='-c'?'1216\n':JSON.stringify({cursor_before:1216,cursor_after:1500,rows_imported:250,total:500,sha256:'a'.repeat(64),public_release:false})}};
 const worker=createCemeteryNodeWorker({nodeId,warehouse,enabled:true,spawn});
 const request={payload,idempotencyKey:'test-job-0001'};
 const first=worker.execute(request);assert.equal(first.result.total,500);assert.equal(first.result.rows_imported,250);
 assert.deepEqual(worker.execute(request),first);assert.equal(calls,2);
 assert.throws(()=>worker.execute({...request,payload:{...payload,operation:'readiness'}}),/conflict/);
});
test('uncertain import holds writer and prevents replay',t=>{
 const warehouse=fixture(t);let calls=0;
 const spawn=(cmd,args)=>{calls++;return args[0]==='-c'?{status:0,stdout:'1216\n'}:{status:null,error:Error('timeout')}};
 const worker=createCemeteryNodeWorker({nodeId,warehouse,enabled:true,spawn});
 const request={payload,idempotencyKey:'test-job-0002'};
 assert.throws(()=>worker.execute(request),/reconciliation/);
 assert.throws(()=>worker.execute(request),/EEXIST/);assert.equal(calls,2);
});
test('missing admitted database cannot trigger import',t=>{
 const warehouse=fixture(t);fs.unlinkSync(path.join(warehouse,'registry','va-gravesite-canary.sqlite3'));
 const worker=createCemeteryNodeWorker({nodeId,warehouse,enabled:true,spawn:()=>{throw Error('unexpected spawn')}});
 assert.throws(()=>worker.execute({payload,idempotencyKey:'test-job-0003'}),/ENOENT/);
});
