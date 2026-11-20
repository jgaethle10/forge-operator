import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCENIC_ROUTES,CONFLUENCE_CONNECTIONS,edgeKey,connectedDestinations,activeCorridorExists}
 from '../public/kaidance/field-topology.mjs';
import {scenicChapter,SCENIC_LEG_SECONDS} from '../public/kaidance/field-chapters.mjs';
const source=fs.readFileSync(new URL('../public/kaidance/current-field.mjs',import.meta.url),'utf8');
const registered=[
 'systemia','hudson','discovery','kaidance','raven','saban','evidence'
];

test('every 10.5-second cinematic journey rides a visible connection',()=>{
 assert.equal(SCENIC_ROUTES.length,8);
 assert.ok(CONFLUENCE_CONNECTIONS.length>=SCENIC_ROUTES.length);
 for(const [i,[from,to]] of SCENIC_ROUTES.entries()){
  assert.ok(registered.includes(from)&&registered.includes(to));
  assert.ok(activeCorridorExists(from,to),'Chapter '+(i+1)+' is missing visible '+from+' -> '+to);
  assert.ok(connectedDestinations(from).includes(to));
  assert.ok(connectedDestinations(to).includes(from));
 }
 // Previously missing visual paths in chapters 3 and 8.
 assert.ok(activeCorridorExists('discovery','hudson'));
 assert.ok(activeCorridorExists('saban','systemia'));
});

test('topology does not duplicate visual links or expose unregistered locations',()=>{
 const keys=CONFLUENCE_CONNECTIONS.map(([a,b])=>edgeKey(a,b));
 assert.equal(new Set(keys).size,keys.length);
 for(const [a,b] of CONFLUENCE_CONNECTIONS){
  assert.ok(registered.includes(a)&&registered.includes(b));
  assert.notEqual(a,b);
 }
 assert.deepEqual(connectedDestinations('unknown'),[]);
 assert.equal(activeCorridorExists('unknown','kaidance'),false);
});

test('continuous cinematic beams, splitting arrival echo and verified heartbeat are different states',()=>{
 assert.match(source,/from '\.\/field-topology\.mjs'/);
 assert.match(source,/function activeCorridor\(chapter\)/);
 assert.match(source,/function branchingEcho\(chapter\)/);
 assert.match(source,/connectedDestinations\(destination\)/);
 assert.match(source,/activeCorridor\(chapter\);branchingEcho\(chapter\);arrivalBloom\(chapter\)/);
 assert.match(source,/Only the independently source-verified \.beat class may cause a pulse flare/);
 assert.match(source,/if\(marker\.classList\.contains\('beat'\)\)flashStart=time/);
 assert.match(source,/art.*never proof|not show real Systemia orchestration/i);
 assert.doesNotMatch(source,/fetch\(|WebSocket|EventSource|localStorage|sessionStorage|setInterval\(/);
});

test('each chapter progresses to the next named connected node without changing its source truth',()=>{
 const nodes=Object.fromEntries(registered.map(key=>[key,{name:key.toUpperCase(),detail:'Illustrative Evercraft system'}]));
 for(let n=0;n<SCENIC_ROUTES.length;n++){
  const c=scenicChapter(n*SCENIC_LEG_SECONDS+1,SCENIC_ROUTES,nodes);
  assert.ok(activeCorridorExists(c.fromKey,c.toKey));
  assert.equal(c.kind,'ILLUSTRATED JOURNEY');
  assert.match(c.meta,/Not a live mission/);
 }
});
