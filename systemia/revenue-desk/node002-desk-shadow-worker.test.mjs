import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createFindMyPartDeskWorker} from './node002-desk-shadow-worker.mjs';
const NODE='evercraft-node002-nextgen';
function request(){
 const at=new Date().toISOString();
 const e={schema:'evercraft.findmypart.queue-review-envelope.v1',source_tick:Math.floor(Date.parse(at)/300000),observed_at:at,source_authority:'local_receipt_pair_unverified_transport',candidates:[{work_key:'findmypart:shop:fixture',business_name:'Fixture Repair',source_url:'https://example.com/'}],contact_clearance:false,outreach_authorized:false};
 // ASCII fixture, matches Python sort_keys/separators/ensure_ascii contract.
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 e.payload_digest='sha256:'+createHash('sha256').update(JSON.stringify(stable(e))).digest('hex');
 return {payload:{schema:'evercraft.findmypart.node002-desk-request.v1',envelope:e},idempotencyKey:'fmp-desk:'+e.payload_digest.slice(7)};
}
test('default-disabled, wrong node, caller path and job mismatch rejected',()=>{
 const args=request(),deskRoot='/tmp';
 assert.throws(()=>createFindMyPartDeskWorker({nodeId:'wrong',deskRoot}),/scope_denied/);
 assert.throws(()=>createFindMyPartDeskWorker({nodeId:NODE,deskRoot}).execute(args),/disabled/);
 const w=createFindMyPartDeskWorker({nodeId:NODE,deskRoot,enabled:true});
 assert.throws(()=>w.execute({...args,payload:{...args.payload,db:'/etc/passwd'}}),/request_denied/);
 assert.throws(()=>w.execute({...args,idempotencyKey:'wrong'}),/key_mismatch/);
});
test('actual Python and SQLite fixture, redacted result and unchanged database',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'fmp-node002-')));
 try{
  const db=path.join(root,'desk.sqlite3');
  const setup=spawnSync('/usr/bin/python3',['-c',`import sqlite3,sys,json
with sqlite3.connect(sys.argv[1]) as c:
 c.execute("CREATE TABLE opportunities(id INTEGER,external_id TEXT,body TEXT)")
 c.execute("CREATE TABLE sent(id INTEGER,opportunity_id INTEGER,body TEXT,recorded_at TEXT)")
 c.execute("INSERT INTO opportunities VALUES(1,'fixture',?)",(json.dumps({"business":"Fixture Repair"}),))
 c.execute("INSERT INTO sent VALUES(1,1,?,'fixture')",(json.dumps({"recipient":"private@example.com"}),))
`,db]);
  assert.equal(setup.status,0);
  const before=fs.readFileSync(db);
  const w=createFindMyPartDeskWorker({nodeId:NODE,deskRoot:root,enabled:true});
  const args=request(),r=w.execute(args);
  assert.equal(r.candidates[0].sent_matches,1);
  assert.equal(r.outreach_authorized,false);
  assert.equal(r.transport_authenticated,false);
  assert.equal(r.gmail_history_verified,false);
  assert.equal(r.source_digest,args.payload.envelope.payload_digest);
  assert.equal(JSON.stringify(r).includes('private@example.com'),false);
  assert.deepEqual(fs.readFileSync(db),before);
  const changed=structuredClone(args);changed.payload.envelope.candidates[0].business_name='Changed Repair';
  assert.throws(()=>w.execute(changed),/desk_review_held/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
