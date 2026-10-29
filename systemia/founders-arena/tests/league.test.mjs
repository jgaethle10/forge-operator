import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {playWithLocalAgent,requireLocalEndpoint} from '../local-agent-runner.mjs';
import {createWorld,createMatch,recordTurn,decision,validateDecisions,verifyMatch,standings,observe} from '../league.mjs';
import {runDemo} from '../demo.mjs';

function allDecisions(world, action='cultivate') {
  return world.players.map(p=>decision(world.turn+1,p.id,action));
}
test('seeded 12-turn fixture replay is byte-identical and hash verified',()=>{
  const a=runDemo();const b=runDemo();
  assert.deepEqual(a,b);assert.equal(verifyMatch(a),true);
  assert.equal(a.turns.length,12);assert.equal(standings(a.final).length,4);
  assert.match(a.digest,/^[a-f0-9]{64}$/);
});
test('inputs must have exactly one decision per agent with right turn and valid action',()=>{
  const w=createWorld();const ds=allDecisions(w);
  assert.throws(()=>validateDecisions(w,ds.slice(1)),/One decision/);
  assert.throws(()=>validateDecisions(w,[ds[0],ds[0],ds[2],ds[3]]),/Invalid or duplicate/);
  assert.throws(()=>validateDecisions(w,ds.map((d,i)=>i===0?{...d,turn:99}:d)),/Invalid/);
  assert.throws(()=>validateDecisions(w,ds.map((d,i)=>i===0?{...d,action:'shell'}:d)),/Invalid/);
  assert.throws(()=>validateDecisions(w,ds.map((d,i)=>i===0?{...d,tool:'http://evil'}:d)),/Invalid/);
});
test('aid requires a real different target',()=>{
  const w=createWorld();const ds=allDecisions(w);
  assert.throws(()=>validateDecisions(w,ds.map((d,i)=>i===0?decision(1,'Systemia','aid','Systemia'):d)),/target/);
  const ok=ds.map((d,i)=>i===0?decision(1,'Systemia','aid','Forge'):d);
  const m=createMatch();recordTurn(m,ok);
  assert.equal(m.final.players.find(p=>p.id==='Forge').food,28);
});
test('submission order does not influence results',()=>{
  const a=createMatch(),b=createMatch();
  const d=allDecisions(a.final,'research');
  recordTurn(a,d);recordTurn(b,[...d].reverse());
  assert.deepEqual(a,b);
});
test('receipts reject changed decisions, changed snapshot, changed initial and changed digest',()=>{
  for(const modify of [
    m=>m.turns[0].decisions[0].action='rest',
    m=>m.turns[0].snapshot.players[0].food=900,
    m=>m.initial.seed=123,
    m=>m.digest='ff',
  ]) {const m=runDemo(2);modify(m);assert.throws(()=>verifyMatch(m));}
});
test('observation excludes competitors private inventory, supports all roster counts up to 19',()=>{
  const roster=Array.from({length:19},(_,i)=>`Agent${i}`);const w=createWorld({roster});
  const obs=observe(w,'Agent1');
  assert.equal(obs.opponents.length,18);
  assert.ok(obs.opponents.every(o=>!Object.hasOwn(o,'food')&&!Object.hasOwn(o,'energy')));
  assert.ok(obs.public.standings.every(o=>!Object.hasOwn(o,'food')&&!Object.hasOwn(o,'energy')&&!Object.hasOwn(o,'knowledge')));
  assert.throws(()=>createWorld({roster:[...roster,'Agent19']}),/Invalid roster/);
});
test('gateway processes new, observe, advance and receipt with JSONL',()=>{
  const cmds=[{command:'new'}, {command:'observe',agent_id:'Systemia'},
    {command:'advance',decisions:allDecisions(createWorld())},{command:'receipt'}];
  const proc=spawnSync(process.execPath,['gateway.mjs'],{cwd:new URL('..',import.meta.url).pathname,
    input:cmds.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8'});
  assert.equal(proc.status,0,proc.stderr);
  const lines=proc.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length,4);
  assert.ok(lines.every(x=>x.ok));assert.equal(lines[3].result.verified,true);
});

test('loopback HTTP adapter drives real external decision requests and verifies receipts',async()=>{
  const observations=[];
  const server=createServer(async(req,res)=>{
    let buf='';for await(const chunk of req)buf+=chunk;
    const parsed=JSON.parse(buf);observations.push(parsed.observation);
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({action:'cultivate'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/decide`;
    const match=await playWithLocalAgent({endpoint:url,rounds:3});
    assert.equal(match.turns.length,3);assert.equal(observations.length,12);
    assert.equal(verifyMatch(match),true);
    assert.equal(observations[0].schema,'evercraft.founders-arena.observation.v1');
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('external provider must be loopback only and no fallback is allowed',async()=>{
  for(const url of ['https://example.com/','http://192.168.0.1:8888/','http://localhost/','file:///tmp/x'])
    assert.throws(()=>requireLocalEndpoint(url));
  const server=createServer((req,res)=>{res.writeHead(200);res.end(JSON.stringify({action:'execute_shell'}))});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await assert.rejects(()=>playWithLocalAgent({endpoint:`http://127.0.0.1:${server.address().port}/`,rounds:1}),/Invalid/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
