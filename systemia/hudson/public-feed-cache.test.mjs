import test from 'node:test';
import assert from 'node:assert/strict';
import {createHudsonFeedCache} from './public-feed-cache.mjs';

const makeSnapshot=(at)=>({
 schema:'evercraft.hudson.public-activity.v1',
 status:'connected',
 published_at:new Date(at).toISOString(),
 sources:[{id:'evercraft-git'}],
 events:[]
});
test('slow public Git reads do not block HTTP handlers or launch duplicate jobs',async()=>{
 let release,loads=0;
 const pending=new Promise(resolve=>{release=resolve});
 const cache=createHudsonFeedCache({
  loadSnapshot:()=>{loads++;return pending},
  now:()=>1000,intervalMs:1000,waitMs:10,
 });
 const [one,two]=await Promise.all([cache.read(),cache.read()]);
 assert.equal(one,null);
 assert.equal(two,null);
 assert.equal(loads,1,'one Git worker serves concurrent readers');
 release(makeSnapshot(1000));
 await Promise.resolve();await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));
 const fresh=await cache.read();
 assert.equal(fresh.published_at,makeSnapshot(1000).published_at);
 assert.equal(loads,1,'cache suppresses repeat work inside cadence');
});
test('a failed background update retains old timestamp rather than faking new activity',async()=>{
 let now=5000,fail=false,loads=0;
 const cache=createHudsonFeedCache({
  loadSnapshot:async()=>{loads++;if(fail)throw Error('offline');return makeSnapshot(now)},
  now:()=>now,intervalMs:1000,waitMs:100,
 });
 const before=await cache.read();
 assert.equal(before.published_at,makeSnapshot(5000).published_at);
 now=7001;fail=true;
 const whileRunning=await cache.read();
 assert.equal(whileRunning.published_at,before.published_at);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await cache.read()).published_at,before.published_at);
 assert.equal(loads,2);
});
test('rejected or malformed public feed cannot replace prior valid evidence',async()=>{
 let now=5000,mode='good';
 const cache=createHudsonFeedCache({
  loadSnapshot:async()=>mode==='good'?makeSnapshot(5000):{status:'connected',events:[{private:'not allowed'}]},
  now:()=>now,intervalMs:1000,waitMs:100,
 });
 const old=await cache.read();
 mode='bad';now=8000;
 assert.deepEqual(await cache.read(),old);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(await cache.read(),old);
});
