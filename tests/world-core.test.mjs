import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,STORAGE_KEY,initialWorld,validateWorld,loadWorld,saveWorld,applyCommand,stepAgents,canWalk,agentActivity} from '../public/worlds/world-core.mjs';
function storage(){const d=new Map();return {getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,v)};}
test('valid canonical browser world and unique actors',()=>{const w=initialWorld();assert.equal(w.schema,SCHEMA);assert.equal(new Set(w.agents.map(a=>a.id)).size,3);assert.equal(validateWorld(w),w);});
test('text commands really mutate state and advance revision',()=>{let w=initialWorld();for(const command of ['add tree','plant flower at 4, 2','sky sunset']){const result=applyCommand(w,command);assert.notEqual(result.world,w);w=result.world;}assert.equal(w.objects.length,2);assert.equal(w.objects[1].x,4);assert.equal(w.sky,'sunset');assert.equal(w.revision,4);});
test('default placements stay visible but out of the direct walking line',()=>{const o=applyCommand(initialWorld(),'add tree').world.objects[0];assert.equal(o.x,4);assert.equal(o.z,1);});
test('invalid and out-of-bounds edits fail closed',()=>{const w=initialWorld();for(const cmd of ['add dragon','plant tree at 199, 3','remove last'])assert.deepEqual(applyCommand(w,cmd).world,w);assert.throws(()=>validateWorld({...w,objects:[{id:'x',kind:'script',x:0,z:0}]}));});
test('save / reload persists edits',()=>{const s=storage();const w=applyCommand(initialWorld(),'add bench').world;saveWorld(s,w);assert.equal(JSON.parse(s.getItem(STORAGE_KEY)).revision,2);assert.deepEqual(loadWorld(s).objects,w.objects);});
test('bad storage is isolated and does not execute prototype injection',()=>{const s=storage();s.setItem(STORAGE_KEY,'{broken');assert.deepEqual(loadWorld(s),initialWorld());const w=initialWorld();assert.throws(()=>validateWorld({...w,objects:[{id:'unsafe',kind:'__proto__',x:0,z:0}]}));});
test('agent projection is bounded and deterministic for a given clock',()=>{const w=initialWorld();const a=stepAgents(w,1/60,12);assert.deepEqual(a,stepAgents(w,1/60,12));assert.equal(a.length,3);assert.ok(a.every(x=>Number.isFinite(x.renderX)));});
test('player collider blocks solid objects and world edge',()=>{assert.equal(canWalk(0,0),true);assert.equal(canWalk(-5,-3.4),false);assert.equal(canWalk(29,1),false);});
test('inhabitants change goals and dialogue when user changes their world',()=>{
 let w=initialWorld();
 const garden=agentActivity(w,'pip');
 const workshop=agentActivity(w,'momo');
 const observer=agentActivity(w,'lumi');
 w=applyCommand(w,'plant flower at 4, 2').world;
 assert.notEqual(agentActivity(w,'pip').activity,garden.activity);
 assert.match(agentActivity(w,'pip').dialogue,/flowers/i);
 w=applyCommand(w,'add lamp').world;
 assert.notEqual(agentActivity(w,'momo').activity,workshop.activity);
 w=applyCommand(w,'sky night').world;
 assert.notEqual(agentActivity(w,'lumi').activity,observer.activity);
 const a=stepAgents(w,1/60,9);
 assert.equal(a[0].activity,agentActivity(w,'pip').activity);
 assert.ok(a.every(x=>Number.isFinite(x.renderZ)&&Math.abs(x.renderX)<=17));
 assert.throws(()=>agentActivity(w,'stranger'),/Unknown/);
});
test('import rejects malicious or unbounded agent memories',()=>{
 const w=initialWorld();w.agents[0].memories=['X'.repeat(161)];
 assert.throws(()=>validateWorld(w),/Invalid inhabitant/);
});
