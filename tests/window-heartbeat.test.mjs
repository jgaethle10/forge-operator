import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceHeartbeat,runHeartbeat,STATE_SCHEMA,STATE_BRANCH,STATE_PATH} from '../systemia/society/window-heartbeat.mjs';
import {REAL_TICK_MS,PUBLIC_GENESIS_MS} from '../public/the-window/world.mjs';

const placeholder={schema:STATE_SCHEMA,initialized:false,release_status:'held'};
const instant=PUBLIC_GENESIS_MS+100*REAL_TICK_MS;
test('first heartbeat imports existing public projection once, not on every viewer refresh',()=>{
  const a=advanceHeartbeat(placeholder,instant);
  assert.equal(a.changed,true);
  assert.equal(a.state.world.tick,100);
  assert.equal(a.state.sequence,1);
  assert.equal(a.state.origin,'clock-replay-import-2026-10-18');
  assert.equal(a.state.authority,'github_actions_state_branch');
  assert.equal(a.state.model_mode,'rule_policy_no_llm');
  assert.equal(a.state.release_status,'held');
  assert.equal(a.state.run.first_activation,true);
});
test('subsequent heartbeats are independent and persist life across days',()=>{
  const init=advanceHeartbeat(placeholder,instant).state;
  const after=advanceHeartbeat(init,instant+140*REAL_TICK_MS).state;
  assert.equal(after.world.tick,240);
  assert.equal(after.run.steps,140);
  assert.ok(after.world.civic.decisions>=14);
  assert.ok(after.world.civic.proposals.length>=1);
  assert.ok(after.world.events.some(e=>['proposal','pledge','refusal','construction','project_completed','failure'].includes(e.type)));
  const later=advanceHeartbeat(after,instant+160*REAL_TICK_MS).state;
  assert.equal(later.world.tick,260);
  assert.equal(later.world.civic.proposals.length>=after.world.civic.proposals.length,true);
  assert.deepEqual(later.world.actors.map(x=>x.id),after.world.actors.map(x=>x.id));
  assert.equal(later.world.created_at,init.world.created_at);
});
test('idempotent heartbeat and stale clock fail closed',()=>{
  const s=advanceHeartbeat(placeholder,instant).state;
  assert.equal(advanceHeartbeat(s,instant+5000).changed,false);
  assert.throws(()=>advanceHeartbeat(s,instant-1000),/Clock moved backwards/);
});
test('bounded outage recovery is explicit, never secretly skipped',()=>{
  const s=advanceHeartbeat(placeholder,instant).state;
  const a=advanceHeartbeat(s,instant+100*REAL_TICK_MS,{maxSteps:20}).state;
  assert.equal(a.run.steps,20);assert.equal(a.run.pending_ticks,80);
  const b=advanceHeartbeat(a,instant+100*REAL_TICK_MS,{maxSteps:90}).state;
  assert.equal(b.run.steps,80);assert.equal(b.run.pending_ticks,0);
  assert.equal(b.world.tick,200);
});
test('tampered world hash or malformed snapshots refuse persistence',()=>{
  const s=advanceHeartbeat(placeholder,instant).state;
  const altered=structuredClone(s);altered.world.actors[0].coins+=3000;
  assert.throws(()=>advanceHeartbeat(altered,instant+REAL_TICK_MS),/hash mismatch/);
  assert.throws(()=>advanceHeartbeat({...s,world:{...s.world,actors:[]}},instant+REAL_TICK_MS),/Invalid canonical/);
});
test('GitHub integration writes only an exact SHA-pinned state branch path',async()=>{
  const calls=[];
  const json=(status,obj)=>({ok:status>=200&&status<300,status,json:async()=>obj});
  const fake=async(url,options)=>{
    calls.push({url,options});
    if(options.method==='GET')return json(200,{sha:'abc123',encoding:'base64',
      content:Buffer.from(JSON.stringify(placeholder)).toString('base64')});
    if(options.method==='PUT'){
      const body=JSON.parse(options.body);
      assert.equal(body.branch,STATE_BRANCH);
      assert.equal(body.sha,'abc123');
      assert.equal(body.content.length>10,true);
      return json(200,{content:{sha:'newsha'}});
    }
    throw Error('Unexpected API method');
  };
  const r=await runHeartbeat({token:'fake-token',repo:'jgaethle10/forge-operator',now:instant,fetchImpl:fake});
  assert.equal(r.changed,true);
  assert.equal(calls.length,2);
  assert.ok(calls[0].url.includes(STATE_PATH+'?ref='+STATE_BRANCH));
  assert.equal(calls[1].url.endsWith('/contents/'+STATE_PATH),true);
  assert.equal(JSON.parse(calls[1].options.body).branch,STATE_BRANCH);
});
test('write conflicts are surfaced rather than overwriting concurrent world state',async()=>{
  const fake=async(url,options)=>{
    if(options.method==='GET')return {ok:true,status:200,json:async()=>({
      sha:'abc123',encoding:'base64',
      content:Buffer.from(JSON.stringify(placeholder)).toString('base64')})};
    return {ok:false,status:409,json:async()=>({message:'SHA mismatch'})};
  };
  await assert.rejects(()=>runHeartbeat({token:'fake',repo:'jgaethle10/forge-operator',now:instant,fetchImpl:fake}),/409/);
});
