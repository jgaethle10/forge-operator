import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {startEvercraftComputeNode} from '../compute/runtime-node.mjs';
import {FINDMYPART_DESK_WORKLOAD as W} from './node002-desk-shadow-worker.mjs';
const NODE='evercraft-node002-nextgen';
test('existing Compute lease admits only explicit local desk binding; no live customer access',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'fmp-compute-')));
 const token=randomBytes(32).toString('hex'), nodes=[];
 try{
  const deskRoot=path.join(root,'desk');fs.mkdirSync(deskRoot,{mode:0o700});
  const db=path.join(deskRoot,'desk.sqlite3');
  const setup=spawnSync('/usr/bin/python3',['-c',`import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
 c.execute("CREATE TABLE opportunities(id INTEGER,external_id TEXT,body TEXT)")
 c.execute("CREATE TABLE sent(id INTEGER,opportunity_id INTEGER,body TEXT,recorded_at TEXT)")
`,db]);assert.equal(setup.status,0);
  const before=fs.readFileSync(db);
  async function boot(options){
   const n=await startEvercraftComputeNode({root,nodeId:NODE,allocatorToken:token,...options});nodes.push(n);return n;
  }
  async function post(n,route,body,auth){
   const r=await fetch(n.endpoint+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   return {status:r.status,body:await r.json()};
  }
  const disabled=await boot({});
  assert.equal((await post(disabled,'/v1/leases',{workload_class:W},true)).status,422);
  const wrong=await boot({nodeId:'other-node',findMyPartDeskReviewEnabled:true,findMyPartDeskRoot:deskRoot});
  assert.equal((await post(wrong,'/v1/leases',{workload_class:W},true)).status,422);
  const n=await boot({findMyPartDeskReviewEnabled:true,findMyPartDeskRoot:deskRoot});
  assert.equal((await post(n,'/v1/leases',{workload_class:W},false)).status,401);
  const lease=await post(n,'/v1/leases',{workload_class:W},true);
  assert.equal(lease.status,201);
  const at=new Date().toISOString();
  const e={schema:'evercraft.findmypart.queue-review-envelope.v1',source_tick:Math.floor(Date.parse(at)/300000),observed_at:at,source_authority:'local_receipt_pair_unverified_transport',candidates:[{work_key:'findmypart:shop:fixture',business_name:'Fixture Repair',source_url:'https://example.com/'}],contact_clearance:false,outreach_authorized:false};
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  e.payload_digest='sha256:'+createHash('sha256').update(JSON.stringify(stable(e))).digest('hex');
  const k='fmp-desk:'+e.payload_digest.slice(7);
  const body={lease_id:lease.body.lease_id,token:lease.body.token,workload_class:W,idempotency_key:k,input:{idempotency_key:k,payload:{schema:'evercraft.findmypart.node002-desk-request.v1',envelope:e}}};
  assert.equal((await post(n,'/v1/jobs',{...body,token:'wrong'})).status,401);
  assert.equal((await post(n,'/v1/jobs',{...body,input:{...body.input,idempotency_key:'wrong'}})).status,422);
  const r=await post(n,'/v1/jobs',body);
  assert.equal(r.status,200);
  assert.equal(r.body.result.source_digest,e.payload_digest);
  assert.equal(r.body.result.outreach_authorized,false);
  assert.equal(r.body.result.transport_authenticated,false);
  assert.ok(r.body.receipt.receipt_hash);
  assert.deepEqual(fs.readFileSync(db),before);
  assert.equal((await post(n,'/v1/leases/'+lease.body.lease_id+'/release',{token:lease.body.token})).status,200);
  assert.equal((await post(n,'/v1/jobs',body)).status,401);
 }finally{for(const n of nodes.reverse())await n.close();fs.rmSync(root,{recursive:true,force:true})}
});
