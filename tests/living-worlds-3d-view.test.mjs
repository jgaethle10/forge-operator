import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeHouse,placeFurniture,advanceHouse,validateHouse} from '../public/living-worlds/house-core.mjs';
import {toHouseVisualFrame,HOUSE_VISUAL_SCHEMA} from '../public/worlds/house-visual.mjs';
import {createHouseSpectator,createResidentHouseSpectator,HOUSE_001_STORAGE} from '../public/worlds/house-mode.mjs';
import {buildHouseViewBundle} from '../scripts/build-house-worlds-bundle.mjs';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};};

test('World Engine scene data becomes bounded primitives in the existing Worlds renderer contract',()=>{
  const house=makeHouse();
  const frame=toHouseVisualFrame(house);
  assert.equal(frame.schema,HOUSE_VISUAL_SCHEMA);
  assert.equal(frame.sourceWorldId,'living-worlds-house-001');
  assert.equal(frame.renderer,'evercraft-worlds-existing-webgl2');
  assert.equal(frame.authority,'browser-local-projection');
  assert.equal(frame.actors.length,4);
  assert.ok(frame.draw.length>20&&frame.draw.length<180);
  assert.ok(frame.draw.every(d=>['cube','sphere','cylinder'].includes(d.kind)));
  assert.ok(frame.draw.every(d=>[d.x,d.y,d.z,d.sx,d.sy,d.sz].every(Number.isFinite)));
  assert.ok(frame.draw.every(d=>/^#[0-9a-f]{6}$/i.test(d.color)));
  assert.ok(frame.draw.every(d=>d.sx>0&&d.sy>0&&d.sz>0));
  assert.equal(frame.actors.find(a=>a.id==='mara').x,-3);
  assert.equal(frame.actors.find(a=>a.id==='sable').z,2.5);
});
test('design choices become visible in 3D without changing the World Engine or renderer',()=>{
  const house=makeHouse();
  const before=toHouseVisualFrame(house);
  assert.equal(placeFurniture(house,'plant',8,5),true);
  const after=toHouseVisualFrame(house);
  assert.ok(after.draw.length>before.draw.length);
  assert.equal(after.sourceTick,before.sourceTick);
  assert.ok(after.sourceVersion>before.sourceVersion);
  assert.equal(after.actors.length,before.actors.length);
});
test('3D spectator progresses the same browser-local House and persists its clock',()=>{
  const storage=memory();
  const spectator=createHouseSpectator(storage,0);
  assert.equal(spectator.frame(0).day,1);
  assert.equal(spectator.step(900),false);
  assert.equal(spectator.step(1200),true);
  assert.equal(spectator.step(1201),false);
  const saved=JSON.parse(storage.getItem(HOUSE_001_STORAGE));
  assert.equal(saved.tick,1);
  assert.equal(validateHouse(saved),true);
  const frame=spectator.frame(1600);
  assert.equal(frame.sourceTick,1);
  assert.equal(frame.actors.length,4);
  assert.ok(frame.actors.every(a=>Number.isFinite(a.renderX)&&Number.isFinite(a.renderZ)));
  assert.equal(spectator.near(-3,-2.5)?.id,'mara');
  assert.equal(spectator.near(100,100),null);
});
test('3D viewer restores valid House builder state but rejects corrupted storage',()=>{
  const storage=memory(),house=makeHouse();
  assert.equal(placeFurniture(house,'plant',8,5),true);
  advanceHouse(house);
  storage.setItem(HOUSE_001_STORAGE,JSON.stringify(house));
  const view=createHouseSpectator(storage,200);
  assert.equal(view.source().tick,1);
  assert.equal(view.source().furniture.length,7);
  storage.setItem(HOUSE_001_STORAGE,'{"schema":"no"}');
  const newView=createHouseSpectator(storage,200);
  assert.equal(newView.source().tick,0);
  assert.equal(newView.source().furniture.length,6);
});
test('Mossmere 3D route lazily loads House, and House builder links to opt-in 3D',()=>{
  const worlds=readFileSync(new URL('../public/worlds/app.mjs',import.meta.url),'utf8');
  const builder=readFileSync(new URL('../public/living-worlds/index.html',import.meta.url),'utf8');
  assert.match(worlds,/const HOUSE_MODE=new URLSearchParams\(location.search\).get\('house'\)==='001'/);
  assert.match(worlds,/if\(HOUSE_MODE\)\{[\s\S]{0,140}import\('\.\/house-mode\.bundle\.mjs'\)/);
  assert.doesNotMatch(worlds,/^import .*living-worlds/m);
  assert.match(worlds,/for\(const primitive of houseFrame\.draw\)draw\(primitive\)/);
  assert.match(builder,/href="\.\.\/worlds\/\?house=001"/);
});

test('owned Worlds-only bundle is byte-for-byte generated from canonical House files',async()=>{
  const expected=await buildHouseViewBundle();
  const actual=readFileSync(new URL('../public/worlds/house-mode.bundle.mjs',import.meta.url),'utf8');
  assert.equal(actual,expected);
  assert.doesNotMatch(actual,/^import /m);
  assert.match(actual,/export function createHouseSpectator/);
  assert.match(actual,/evercraft.world-engine.world.v1/);
});

test('3D furniture editor uses House placement rules and persists changes',()=>{
  const storage=memory(),view=createHouseSpectator(storage,0);
  const before=view.frame(0).draw.length;
  assert.equal(view.edit('plant',8,5),true);
  assert.equal(view.edit('desk',8,5),false);
  assert.equal(view.edit('plant',9,5),false);
  assert.ok(view.frame(0).draw.length>before);
  let snapshot=JSON.parse(storage.getItem(HOUSE_001_STORAGE));
  assert.ok(snapshot.furniture.some(f=>f.kind==='plant'&&f.x===8&&f.y===5));
  assert.equal(view.edit('remove',8,5),true);
  assert.equal(view.edit('remove',8,5),false);
  snapshot=JSON.parse(storage.getItem(HOUSE_001_STORAGE));
  assert.equal(snapshot.furniture.some(f=>f.x===8&&f.y===5),false);
  assert.equal(validateHouse(snapshot),true);
});

test('server resident spectator reads accepted snapshots but never ticks or edits the owned world',()=>{
  const viewer=createResidentHouseSpectator();
  assert.equal(viewer.frame(0),null);
  assert.equal(viewer.source(),null);
  assert.equal(viewer.edit('plant',8,5),false);
  assert.equal(viewer.step(3000),false);
  const house=makeHouse();
  const receipt={schema:'evercraft.living-worlds.resident-snapshot.v1',
    authority:'owner_operated_process',model_mode:'rules_only_no_llm',
    writes:'server_owned_only',source_tick:house.tick,sequence:0,
    pending_ticks:0,world:structuredClone(house)};
  assert.equal(viewer.accept(receipt,100),true);
  assert.equal(viewer.accept(receipt,200),false);
  assert.equal(viewer.frame(120).authority,'owner_operated_process_projection');
  assert.equal(viewer.frame(120).actors.length,4);
  assert.equal(viewer.near(-3,-2.5).id,'mara');
  assert.equal(viewer.edit('remove',1,1),false);
  assert.equal(viewer.source().furniture.length,6);
  advanceHouse(house);
  assert.equal(viewer.accept({...receipt,source_tick:1,sequence:1,world:house},500),true);
  assert.equal(viewer.source().tick,1);
  assert.throws(()=>viewer.accept(receipt,1000),/regression/);
  assert.throws(()=>viewer.accept({...receipt,authority:'browser'},1000),/rejected/);
  assert.throws(()=>viewer.accept({...receipt,source_tick:900},1000),/rejected/);
  assert.equal(viewer.source().tick,1);
});
