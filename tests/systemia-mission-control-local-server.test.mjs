import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createLocalMissionControlServer} from '../systemia/organism/mission-control-local-server.mjs';
import {buildLocalMissionSnapshot} from '../systemia/organism/mission-control-local-reader.mjs';
import {createGoalState} from '../systemia/organism/goal-runtime.mjs';
import {parseOperatorSnapshot} from '../public/live/mission-source.mjs';

function httpRequest(port,route='/',options={}){
 return new Promise((resolve,reject)=>{
  const request=http.request({
   host:'127.0.0.1',port,path:route,
   method:options.method||'GET',
   headers:{Host:'127.0.0.1:'+port,...options.headers},
   timeout:3000
  },response=>{
   const chunks=[];
   response.on('data',c=>chunks.push(c));
   response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text:Buffer.concat(chunks).toString('utf8')}));
  });
  request.on('error',reject);request.end();
 });
}
async function open(server){
 await new Promise((ok,fail)=>server.once('error',fail).listen(0,'127.0.0.1',ok));
 return server.address().port;
}
function localWatch(now){
 const body={schema:'evercraft.local-organism-health-watch.v1',state:'healthy',
  action:'none',service_state:'active',node_id:'node-test-001',seed_receipt_present:true,
  nodeseed_endpoint_scope:'loopback_only',nodeseed_health:{ok:true,status:200,node_id:'node-test-001'},
  release_current:true,secret_material_exposed:false,
  authority:'local_user_service_restart_only',observed_at:new Date(now).toISOString()};
 return {...body,receipt_hash:'sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
test('private local snapshot is built from explicit files and contains no private goal text or raw health watcher fields',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'systemia-local-'));
 try{
  const goalFile=path.join(dir,'goal.json'),watchFile=path.join(dir,'watch.json');
  const at=Date.now();
  const goal=createGoalState({goalKey:'customer-secret-reference',objective:'Sensitive customer subject that must not leave local file',now:new Date(at)});
  await writeFile(goalFile,JSON.stringify(goal));
  await writeFile(watchFile,JSON.stringify(localWatch(at)));
  const snap=await buildLocalMissionSnapshot({stateFiles:[goalFile],
   nodeWatches:[{nodeKey:'node001',file:watchFile,expectedNodeId:'node-test-001'}],now:at+1000});
  assert.equal(snap.nodes[0].status,'reported_healthy');
  assert.equal(snap.missions.length,1);
  assert.doesNotMatch(JSON.stringify(snap),/customer-secret-reference|Sensitive customer subject|health-watch\.json|node-test-001/);
  assert.equal(parseOperatorSnapshot(snap,at+1000).nodes.length,1);
  await assert.rejects(buildLocalMissionSnapshot({stateFiles:[goalFile,goalFile]}),/duplicate/);
  await assert.rejects(buildLocalMissionSnapshot({stateFiles:[path.relative(process.cwd(),goalFile)]}),/absolute/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('loopback HTTP serves only finite same-origin assets and a sanitized read-only snapshot',async()=>{
 const snap={schema:'evercraft.systemia.operator-mission-snapshot.v1',exported_at:new Date().toISOString(),missions:[],nodes:[]};
 const server=createLocalMissionControlServer({loadSnapshot:async()=>snap});
 const port=await open(server);
 try{
  const ok=await httpRequest(port,'/v1/snapshot');
  assert.equal(ok.status,200);
  assert.equal(JSON.parse(ok.text).schema,snap.schema);
  assert.match(ok.headers['cache-control'],/no-store/);
  assert.match(ok.headers['content-security-policy'],/connect-src 'self'/);
  assert.equal(ok.headers['access-control-allow-origin'],undefined);
  assert.equal((await httpRequest(port,'/mission-control.html')).status,200);
  assert.equal((await httpRequest(port,'/mission-control.mjs')).status,200);
  assert.equal((await httpRequest(port,'/../../systemia/organism/goal-store.mjs')).status,404);
  assert.equal((await httpRequest(port,'/v1/snapshot?file=%2Fetc%2Fpasswd')).status,400);
  assert.equal((await httpRequest(port,'/v1/snapshot',{method:'POST'})).status,405);
  assert.equal((await httpRequest(port,'/v1/snapshot',{headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await httpRequest(port,'/v1/snapshot',{headers:{Host:'attacker.example:'+port}})).status,403);
  assert.equal((await httpRequest(port,'/v1/snapshot',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('unavailable or unsanitized source fails closed without leaking detailed errors',async()=>{
 const server=createLocalMissionControlServer({loadSnapshot:async()=>{throw Error('secret goal path /private/customer-name.json');}});
 const port=await open(server);
 try{
  const fail=await httpRequest(port,'/v1/snapshot');
  assert.equal(fail.status,503);
  assert.doesNotMatch(fail.text,/customer-name|private/);
  assert.match(fail.text,/unavailable/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
