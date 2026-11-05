import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../public/the-window/world.mjs';
import {createMystery,revealNext,suspicionScores,accuse,checkpointMystery,restoreMystery,readMysteryCheckpoint,writeMysteryCheckpoint,MYSTERY_SAVE_KEY} from '../public/the-window/mystery.mjs';
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


test('local progress survives reload without serializing memory or generated statements',()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 const originalWorld=JSON.stringify(world);
 let caseFile=createMystery(world,9);
 caseFile=revealNext(revealNext(revealNext(caseFile)));
 const choice=caseFile.suspects[1].id;
 assert.equal(writeMysteryCheckpoint(storage,caseFile,choice),true);
 const raw=storage.getItem(MYSTERY_SAVE_KEY);
 assert.ok(raw.length<250);
 assert.ok(!raw.includes('memories')&&!raw.includes('testimony')&&!raw.includes('blueprint'));
 const resumed=readMysteryCheckpoint(storage,world);
 assert.deepEqual(resumed,{state:caseFile,choice});
 assert.equal(JSON.stringify(world),originalWorld);
 assert.equal(JSON.stringify(resumed.state),JSON.stringify(caseFile));
});
test('a completed case, including an incorrect theory, resumes exactly',()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 let started=createMystery(world,4);
 for(let i=0;i<4;i++)started=revealNext(started);
 const wrong=started.suspects.find(s=>s.id!==started.answerId).id;
 started=accuse(started,wrong);
 assert.equal(started.accusation.correct,false);
 assert.equal(writeMysteryCheckpoint(storage,started,wrong),true);
 const resumed=readMysteryCheckpoint(storage,world);
 assert.deepEqual(resumed.state,started);
 assert.throws(()=>accuse(resumed.state,started.answerId),/already resolved/);
});
test('tampered, incomplete or oversized case checkpoints fail closed',()=>{
 const valid=checkpointMystery(createMystery(world,2),'r2');
 assert.throws(()=>restoreMystery(world,{...valid,seed:-1}),/Invalid local/);
 assert.throws(()=>restoreMystery(world,{...valid,revealed:5}),/Invalid local/);
 assert.throws(()=>restoreMystery(world,{...valid,choice:'r999'}),/Unknown saved/);
 assert.throws(()=>restoreMystery(world,{...valid,suspectId:'r2'}),/at least three/);
 assert.throws(()=>restoreMystery(world,{...valid,evil:true}),/Invalid local/);
 assert.throws(()=>restoreMystery(world,{'__proto__':null}),/Invalid local/);
 const storage={getItem:()=>'{garbage',setItem:()=>{throw Error('denied')}};
 assert.equal(readMysteryCheckpoint(storage,world),null);
 assert.equal(writeMysteryCheckpoint(storage,createMystery(world,0),'r2'),false);
 assert.equal(readMysteryCheckpoint({getItem:()=>'{'.repeat(1200)},world),null);
});
