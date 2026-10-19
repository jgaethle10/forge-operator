import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {replayWorld,createWorld,advanceWorld,REAL_TICK_MS,PUBLIC_GENESIS_MS} from '../public/the-window/world.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=path.resolve(root,'../public/the-window');

test('two independent viewers reconstruct identical town state for the same UTC instant',()=>{
  const instant=PUBLIC_GENESIS_MS+480*REAL_TICK_MS;
  const a=replayWorld(instant),b=replayWorld(instant);
  assert.deepEqual(a,b);
  assert.equal(a.actors.length,12);
  assert.equal(a.tick,480);
  assert.equal(new Set(a.actors.map(x=>x.household)).size,4);
});
test('replaying from genesis matches incremental deterministic advancement',()=>{
  const instant=PUBLIC_GENESIS_MS+320*REAL_TICK_MS;
  const first=replayWorld(instant);
  const next=structuredClone(first);
  advanceWorld(next,instant+REAL_TICK_MS);
  const reconstructed=replayWorld(instant+REAL_TICK_MS);
  delete next.projection;
  delete reconstructed.projection;
  assert.deepEqual(next,reconstructed);
});
test('society has continuing events, memories, relationships and aspirations',()=>{
  const world=replayWorld(PUBLIC_GENESIS_MS+2500*REAL_TICK_MS);
  assert.ok(world.events.length>0);
  assert.ok(world.actors.some(a=>a.memories.length>0));
  assert.ok(world.actors.some(a=>a.goal_milestones>0));
  assert.ok(world.actors.some(a=>Object.values(a.bonds).some(x=>x!==50)));
});
test('public spectator reads canonical world commits and remains unpromoted',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const js=fs.readFileSync(path.join(dir,'client.mjs'),'utf8');
  assert.match(html,/\.\/client\.mjs/);
  assert.match(html,/\.\/style\.css/);
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/Fictional rule-based agents/);
  assert.match(html,/independent GitHub runner/);
  assert.match(html,/id="projects"/);
  assert.match(html,/id="social-arcs"/);
  assert.match(js,/renderSocial/);
  assert.match(js,/window-society-state\/state\/window\.json/);
  assert.match(js,/crypto\.subtle\.digest/);
  assert.match(js,/Untrusted or noncanonical world state/);
  assert.match(js,/World state hash did not match/);
  assert.match(js,/Heartbeat delayed/);
  assert.doesNotMatch(js,/replayWorld|advanceWorld|new EventSource/);
});
