import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../public/the-window/world.mjs';
import {createMystery,revealNext,suspicionScores,accuse} from '../public/the-window/mystery.mjs';
const world=createWorld(0,818);
test('same seed, same fictional mystery; no mutation to Mossmere',()=>{
  const before=JSON.stringify(world);
  assert.deepEqual(createMystery(world,27),createMystery(world,27));
  assert.equal(JSON.stringify(world),before);
  assert.equal(createMystery(world,27).source,'local_deterministic_rule_scenario');
});
test('bounded clues reveal in order without state mutation',()=>{
  const start=createMystery(world,9);let current=start;
  for(let i=1;i<=4;i++){current=revealNext(current);assert.equal(current.revealed,i);}
  assert.strictEqual(revealNext(current),current);
  assert.equal(start.revealed,0);
});
test('reject premature, unknown or repeated accusation',()=>{
  const start=createMystery(world,0);
  assert.throws(()=>accuse(start,start.answerId),/at least three/);
  let current=start;for(let i=0;i<3;i++)current=revealNext(current);
  assert.throws(()=>accuse(current,'unknown'),/Unknown suspect/);
  const result=accuse(current,current.answerId);
  assert.equal(result.accusation.correct,true);
  assert.throws(()=>accuse(result,result.answerId),/already resolved/);
});
test('suspicion is based only on revealed clues',()=>{
  let current=createMystery(world,1);
  assert.ok(Object.values(suspicionScores(current)).every(x=>x===0));
  current=revealNext(current);
  assert.ok(Object.values(suspicionScores(current)).every(x=>x===0));
  current=revealNext(current);
  assert.equal(suspicionScores(current)[current.answerId],1);
  current=revealNext(current);
  assert.equal(suspicionScores(current)[current.answerId],4);
});
test('seeded cases vary and witness differs from case answer',()=>{
  const ids=new Set();
  for(let seed=0;seed<12;seed++){
    const s=createMystery(world,seed);ids.add(s.answerId);
    assert.notEqual(s.clues[1].source,s.suspects.find(x=>x.id===s.answerId).name+' (fictional witness)');
  }
  assert.equal(ids.size,4);
});
test('invalid input fails closed',()=>{
  assert.throws(()=>createMystery({},0),/Invalid mystery/);
  assert.throws(()=>createMystery(world,-1),/Invalid mystery/);
  assert.throws(()=>createMystery(world,Infinity),/Invalid mystery/);
  assert.throws(()=>createMystery(world,1000001),/Invalid mystery/);
});
