import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {projectLocalHealthWatch} from '../systemia/organism/mission-control-node-watch.mjs';
import {parseOperatorSnapshot} from '../public/live/mission-source.mjs';

const now=Date.parse('2026-11-09T18:10:00Z'),expected='evercraft-node001-penguin';
function make(over={}){
 const body={
  schema:'evercraft.local-organism-health-watch.v1',state:'healthy',action:'none',
  service_state:'active',seed_receipt_present:true,node_id:expected,
  nodeseed_endpoint_scope:'loopback_only',
  nodeseed_health:{ok:true,status:200,node_id:expected},
  release_current:true,authority:'local_user_service_restart_only',
  secret_material_exposed:false,observed_at:new Date(now-30000).toISOString(),...over
 };
 return {...body,receipt_hash:'sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
const project=(record,at=now)=>projectLocalHealthWatch(record,{nodeKey:'node001',expectedNodeId:expected,now:at});

test('local watcher projects only a self-reported probe, not authenticated remote state',()=>{
 const node=project(make());
 assert.equal(node.status,'reported_healthy');
 assert.match(node.note,/remote connection and execution not verified/i);
 const parsed=parseOperatorSnapshot({schema:'evercraft.systemia.operator-mission-snapshot.v1',
  exported_at:new Date(now).toISOString(),missions:[],nodes:[node]},now);
 assert.equal(parsed.nodes[0].status,'reported_healthy');
 assert.match(parsed.nodes[0].provenance,/NOT AUTHENTICATED/);
});
test('observation expires both in exporter and browser after three minutes',()=>{
 assert.equal(project(make(),now+210000).status,'stale');
 const report=project(make());
 const parsed=parseOperatorSnapshot({schema:'evercraft.systemia.operator-mission-snapshot.v1',
  exported_at:new Date(now).toISOString(),missions:[],nodes:[report]},now+210000);
 assert.equal(parsed.nodes[0].status,'stale');
});
test('tamper, device ID mismatch and wrong authority fail closed',()=>{
 const altered=make();altered.nodeseed_health.ok=false;
 assert.throws(()=>project(altered),/hash mismatch/);
 assert.throws(()=>project(make({node_id:'other-node'})),/identity mismatch/);
 assert.throws(()=>project(make({authority:'superuser'})),/authority/);
 assert.equal(project(make({nodeseed_health:{ok:true,status:200,node_id:'other-node'}})).status,'reported_degraded');
});
test('degraded and bootstrap non-green; recovered must bind after identity',()=>{
 assert.equal(project(make({state:'degraded',nodeseed_health:{ok:false,status:null,node_id:expected}})).status,'reported_degraded');
 assert.equal(project(make({state:'bootstrapping'})).status,'bootstrapping');
 const after={node_id:expected,service_state:'active',seed_receipt_present:true,
  nodeseed_endpoint_scope:'loopback_only',nodeseed_health:{ok:true,status:200,node_id:expected},release_current:true};
 assert.equal(project(make({state:'recovered',after})).status,'reported_healthy');
 assert.throws(()=>project(make({state:'recovered',after:{...after,node_id:'wrong'}})),/identity mismatch/);
});
test('node-only CLI keeps outputs private and refuses overwrites',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'systemia-node-snapshot-'));
 try{
  const a=path.join(dir,'watch.json'),b=path.join(dir,'out.json');
  await writeFile(a,JSON.stringify(make({observed_at:new Date().toISOString()})));
  const cli=new URL('../systemia/organism/mission-control-export.mjs',import.meta.url);
  execFileSync(process.execPath,[cli.pathname,'--node001-watch',a,'--node001-id',expected,'--out',b]);
  const saved=JSON.parse(await readFile(b,'utf8'));
  assert.equal(saved.missions.length,0);
  assert.equal(saved.nodes[0].status,'reported_healthy');
  assert.equal(saved.nodes[0].node_key,'node001');
  assert.throws(()=>execFileSync(process.execPath,[cli.pathname,'--node001-watch',a,'--node001-id',expected,'--out',b],{stdio:'pipe'}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
