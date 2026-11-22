import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWayfinderEntries,pickWayfinderContext} from '../public/worlds/wayfinder-core.mjs';
const registry=JSON.parse(readFileSync('public/worlds/destinations.v1.json','utf8'));
test('Seattle and Yakima form a bidirectional, registry-backed journey',()=>{
 const seattle=buildWayfinderEntries(registry,'/worlds/flight/','#seattle');
 const yakima=buildWayfinderEntries(registry,'/worlds/hidden-world/yakima-walk/','');
 assert.equal(seattle.active.id,'seattle-sky');
 assert.equal(seattle.recommended.id,'yakima-history-walk');
 assert.equal(seattle.recommended.path,'/worlds/hidden-world/yakima-walk/');
 assert.equal(yakima.active.id,'yakima-history-walk');
 assert.equal(yakima.recommended.id,'seattle-sky');
 assert.equal(yakima.recommended.path,'/worlds/flight/#seattle');
 assert.equal(pickWayfinderContext('/worlds/').current,'mossmere');
});
test('Wayfinder lists registered destinations without carrying identity or state',()=>{
 const result=buildWayfinderEntries(registry,'/worlds/');
 assert.equal(result.entries.length,7);
 for(const destination of result.entries){
  assert.match(destination.path,/^\/worlds\//);
  assert.equal(Object.hasOwn(destination,'player'),false);
  assert.equal(Object.hasOwn(destination,'position'),false);
  assert.equal(Object.hasOwn(destination,'save'),false);
 }
 assert.equal(registry.integration.seamlessTravel,false);
 assert.equal(registry.integration.personalDataTransferred,false);
});
test('Each targeted playable world includes the isolated Wayfinder',()=>{
 for(const file of ['public/worlds/index.html','public/worlds/hidden-world/yakima-walk/index.html']){
  const source=readFileSync(file,'utf8');
  assert.match(source,/<script type="module" src="\/worlds\/wayfinder\.mjs"><\/script>/,file);
  assert.equal(source.split('src="/worlds/wayfinder.mjs"').length-1,1,file);
 }
 const flight=readFileSync('public/worlds/flight/index.html','utf8');
 assert.match(flight,/class="aaar-worlds-nav"/);
 assert.match(flight,/href="\\/worlds\\/hidden-world\\/yakima-walk\\/"/);
 assert.doesNotMatch(flight,/<script\\b[^>]*\\bsrc=/i);
 const source=readFileSync('public/worlds/wayfinder.mjs','utf8');
 assert.match(source,/attachShadow\(\{mode:'open'\}\)/);
 assert.match(source,/credentials:'same-origin'/);
 assert.match(source,/No personal save data is transferred|Travel does not move your character/);
 assert.doesNotMatch(source,/localStorage\.|sessionStorage\.|sendBeacon\(/);
});
test('Invalid registry paths are rejected before they can become navigation URLs',()=>{
 const altered=structuredClone(registry);
 altered.destinations[0].path='https://example.com/';
 assert.throws(()=>buildWayfinderEntries(altered,'/worlds/flight/','#seattle'));
});
