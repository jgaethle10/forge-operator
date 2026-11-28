import test from 'node:test';
import assert from 'node:assert/strict';
import {markets,planGlobalHunt} from '../systemia/revenue-desk/global-hunt-plan.mjs';
test('all 39 localized queries cover 13 initial markets and nine languages',()=>{
 const p=planGlobalHunt({limit:39});
 assert.equal(p.queries.length,39);
 assert.equal(new Set(p.queries.map(q=>q.country)).size,13);
 assert.equal(new Set(p.queries.map(q=>q.language)).size,9);
 assert.equal(new Set(p.queries.map(q=>q.query)).size,39);
 assert.ok(p.queries.some(q=>q.language==='ja'&&q.query.includes('公募')));
});
test('bounded rotation eventually covers entire initial catalog',()=>{
 const seen=new Set();
 for(let cycle=0;cycle<4;cycle++){
  const p=planGlobalHunt({cycle,limit:12});
  assert.equal(p.queries.length,12);
  for(const q of p.queries)seen.add(q.query);
 }
 assert.equal(seen.size,39);
});
test('queries do not confer contact authority or claim verified demand',()=>{
 const p=planGlobalHunt({limit:39});
 assert.equal(p.search_performed,false);
 assert.equal(p.send_performed,false);
 for(const q of p.queries){
  assert.equal(q.qualified,false);
  assert.equal(q.contact_authorized,false);
  assert.ok(q.evidence_required.includes('approved_response_channel'));
 }
});
test('invalid bounds fail closed',()=>{
 for(const args of [{cycle:-1},{cycle:Infinity},{limit:0},{limit:40},{limit:1.5}])assert.throws(()=>planGlobalHunt(args));
});
