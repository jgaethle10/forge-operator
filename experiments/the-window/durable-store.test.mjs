import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DurableWorldStore } from './durable-store.mjs';
import { REAL_TICK_MS, WorldStore } from './engine.mjs';

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mossmere-durable-'));
  try { return run(dir); }
  finally { fs.rmSync(dir, {recursive:true,force:true}); }
}

test('journal is authoritative and repairs missing or corrupt snapshot', () => fixture(dir => {
  let now = 1000;
  const first = new DurableWorldStore(dir, {now:()=>now});
  for(let i=0;i<20;i++){now += REAL_TICK_MS;first.tick(now);}
  const expected = JSON.stringify(first.world);
  fs.writeFileSync(path.join(dir,'snapshot.json'),'{}');
  const reopened = new DurableWorldStore(dir,{now:()=>now});
  assert.equal(JSON.stringify(reopened.world), expected);
  assert.equal(reopened.recoveredSnapshot,true);
  assert.equal(reopened.world.tick,20);
}));

test('incomplete trailing journal line is truncated without inventing a tick', () => fixture(dir => {
  const first = new DurableWorldStore(dir,{now:()=>1000});
  first.tick(1000+REAL_TICK_MS);
  const file=path.join(dir,'commits.jsonl');
  fs.appendFileSync(file,'{"schema":"evercraft.window.commit.v1","tick":99');
  const second=new DurableWorldStore(dir);
  assert.equal(second.world.tick,1);
  assert.equal(second.tornTailTruncated,true);
  assert.equal(fs.readFileSync(file,'utf8').endsWith('\n'),true);
}));

test('bounded downtime backlog is drained instead of permanently abandoned', () => fixture(dir => {
  new DurableWorldStore(dir,{now:()=>1000});
  const later = new DurableWorldStore(dir,{now:()=>1000+500*REAL_TICK_MS});
  assert.deepEqual(later.catchUp(480),{processed:480,unprocessed:20});
  assert.deepEqual(later.catchUp(20),{processed:20,unprocessed:0});
  assert.equal(later.world.tick,500);
  assert.equal(new DurableWorldStore(dir).world.tick,500);
}));

test('rotation creates compressed audit archives and preserves live world state', () => fixture(dir => {
  const first = new DurableWorldStore(dir,{now:()=>1000});
  for(let i=1;i<=195;i++)first.tick(1000+i*REAL_TICK_MS);
  const archives=fs.readdirSync(path.join(dir,'archive'));
  assert.equal(archives.length,1);
  const archived=zlib.gunzipSync(fs.readFileSync(path.join(dir,'archive',archives[0]))).toString('utf8');
  assert.ok(archived.includes('"tick":192'));
  const subsequent=new DurableWorldStore(dir);
  assert.equal(subsequent.world.tick,195);
  assert.deepEqual(subsequent.world,first.world);
  assert.equal(subsequent.status().journal_start_tick,192);
  assert.ok(subsequent.history(80).length>0);
}));

test('migration imports legacy snapshot without resetting resident memories', () => fixture(dir => {
  const legacy=new WorldStore(dir,{now:()=>1000});
  for(let i=1;i<=12;i++)legacy.tick(1000+i*REAL_TICK_MS);
  const expected=JSON.stringify(legacy.world);
  const migrated=new DurableWorldStore(dir,{now:()=>1000+12*REAL_TICK_MS});
  assert.equal(JSON.stringify(migrated.world),expected);
  assert.equal(migrated.world.tick,12);
  assert.ok(fs.existsSync(path.join(dir,'commits.jsonl')));
}));

test('non-contiguous committed entries fail closed', () => fixture(dir => {
  const first=new DurableWorldStore(dir,{now:()=>1000});
  first.tick(1000+REAL_TICK_MS);
  const file=path.join(dir,'commits.jsonl');
  const illegal={schema:'evercraft.window.commit.v1',tick:7,world:{...first.world,tick:7},events:[]};
  fs.appendFileSync(file,JSON.stringify(illegal)+'\n');
  assert.throws(()=>new DurableWorldStore(dir),/Non-contiguous/);
}));

test('public historical events are ordered and distinct after >160 emissions', () => fixture(dir => {
  const first=new DurableWorldStore(dir,{now:()=>1000});
  for(let i=1;i<=410;i++)first.tick(1000+i*REAL_TICK_MS);
  const events=first.history(1000);
  assert.ok(events.length>160);
  assert.equal(new Set(events.map(e=>e.id)).size,events.length);
  assert.ok(Number(events[0].id.slice(1))>Number(events.at(-1).id.slice(1)));
}));
