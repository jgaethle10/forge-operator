import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPaths,makePublicSnapshot,CANONICAL,SCHEMA} from './publish-public-snapshot.mjs';
const now='2026-11-20T02:00:00.000Z',sha='a'.repeat(40);
test('source routing is bounded to public owned paths',()=>{
 assert.equal(classifyPaths(['systemia/hudson/README.md']),'hudson');
 assert.equal(classifyPaths(['systemia/saban/worker.mjs']),'saban');
 assert.equal(classifyPaths(['systemia/raven/bridge.mjs']),'raven');
 assert.equal(classifyPaths(['public/chum/hot/index.json']),'discovery');
 assert.equal(classifyPaths(['private/customer.json']),null);
});
test('publisher emits only source-derived safe fields',()=>{
 const snapshot=makePublicSnapshot({publishedAt:now,entries:[{
  sha,at:'2026-11-20T01:59:00Z',paths:['systemia/raven/secret.mjs'],message:'Never expose this subject',email:'example@invalid.test'
 }]});
 assert.equal(snapshot.schema,SCHEMA);
 assert.equal(snapshot.status,'connected');
 assert.equal(snapshot.events.length,1);
 assert.deepEqual(Object.keys(snapshot.events[0]),['id','at','system','kind','title','source_url','public','source_verified']);
 assert.equal(snapshot.events[0].source_url,CANONICAL+'/commit/'+sha);
 assert.equal(JSON.stringify(snapshot).includes('Never expose'),false);
 assert.equal(JSON.stringify(snapshot).includes('example@'),false);
});
test('publisher drops malformed, duplicate, future and private records',()=>{
 const snapshot=makePublicSnapshot({publishedAt:now,entries:[
  {sha,at:'2026-11-20T01:55:00Z',paths:['systemia/saban/a']},
  {sha,at:'2026-11-20T01:55:00Z',paths:['systemia/saban/a']},
  {sha:'b'.repeat(40),at:'2026-11-20T02:20:00Z',paths:['public/chum/a']},
  {sha:'c'.repeat(40),at:'2026-11-19T22:00:00Z',paths:['internal/private']},
  {sha:'invalid',at:'2026-11-20T01:59:00Z',paths:['public/chum/a']}
 ]});
 assert.equal(snapshot.events.length,1);
});
test('no evidence never becomes generated activity',()=>{
 const snapshot=makePublicSnapshot({publishedAt:now,entries:[]});
 assert.equal(snapshot.events.length,0);
 assert.equal(snapshot.sources.length,1);
});
