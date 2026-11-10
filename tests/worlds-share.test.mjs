import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld,applyCommand} from '../public/worlds/world-core.mjs';
import {SHARE_MAX_OBJECTS,encodeSharedScene,decodeSharedScene,sharedSceneUrl} from '../public/worlds/share-scene.mjs';
function scene(){let w=initialWorld();w=applyCommand(w,'plant flower at 4, 2').world;w=applyCommand(w,'sky sunset').world;w.agents[0].memories=['Private hello near my house'];w.player={x:9,z:7,yaw:2};return w;}
test('Scene links deterministically round-trip decor without personal memories or position',()=>{
 const w=scene(),token=encodeSharedScene(w),same=encodeSharedScene(w);
 assert.equal(token,same);
 const decoded=decodeSharedScene(token);
 assert.equal(decoded.sky,'sunset');
 assert.deepEqual(decoded.objects.map(x=>[x.kind,x.x,x.z]),[['flower',4,2]]);
 assert.deepEqual(decoded.player,initialWorld().player);
 assert.deepEqual(decoded.agents[0].memories,[]);
 const raw=JSON.stringify(decoded);
 assert.ok(!raw.includes('Private hello'));
 const url=sharedSceneUrl('https://example.org/worlds/',w);
 assert.equal(new URL(url).pathname,'/worlds/');
 assert.ok(new URL(url).hash.startsWith('#scene='));
 assert.ok(!url.includes('Private'));
});
test('Scene links reject oversized, invalid and unsafe contents',()=>{
 const w=initialWorld();
 w.objects=Array.from({length:SHARE_MAX_OBJECTS+1},(_,i)=>({id:'made-'+(i+1),kind:'tree',x:0,z:0}));
 assert.throws(()=>encodeSharedScene(w),/40 placed items/);
 for(const token of ['', '###', 'a'.repeat(6001), 'a.b.c', 'aaaa']){
  assert.throws(()=>decodeSharedScene(token));
 }
 const invalid={s:'evercraft.worlds.shared-scene.v1',k:'day',o:[[999,4,2]]};
 const broken=btoa(JSON.stringify(invalid)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
 assert.throws(()=>decodeSharedScene(broken),/Malformed/);
});
