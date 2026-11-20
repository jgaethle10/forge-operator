import test from 'node:test';
import assert from 'node:assert/strict';
import {scenicChapter,SCENIC_LEG_SECONDS} from '../public/kaidance/field-chapters.mjs';

const nodes={
 systemia:{name:'SYSTEMIA',detail:'Mission coordination'},
 kaidance:{name:'KAIDANCE',detail:'Five-minute Collider'},
 hudson:{name:'HUDSON',detail:'Institutional evidence'}
};
const routes=[['systemia','kaidance'],['kaidance','hudson'],['hudson','systemia']];
test('chapters follow the illustrated traveler instead of pinning the card to KAIDANCE',()=>{
 const c0=scenicChapter(0,routes,nodes);
 assert.equal(c0.title,'KAIDANCE');
 assert.equal(c0.fromKey,'systemia');
 assert.equal(c0.toKey,'kaidance');
 assert.equal(c0.kind,'ILLUSTRATED JOURNEY');
 assert.equal(c0.index,0);
 const c1=scenicChapter(SCENIC_LEG_SECONDS,routes,nodes);
 assert.equal(c1.title,'HUDSON');
 assert.equal(c1.fromKey,'kaidance');
 assert.equal(c1.toKey,'hudson');
 assert.equal(c1.index,1);
 const c2=scenicChapter(SCENIC_LEG_SECONDS*2,routes,nodes);
 assert.equal(c2.title,'SYSTEMIA');
 assert.equal(c2.index,2);
 const c3=scenicChapter(SCENIC_LEG_SECONDS*3,routes,nodes);
 assert.equal(c3.title,'KAIDANCE');
 assert.equal(c3.index,0);
 assert.equal(c3.ordinal,3);
});
test('local arrival bloom belongs to the journey and never signals a verified heartbeat',()=>{
 const early=scenicChapter(4,routes,nodes);
 const approach=scenicChapter(SCENIC_LEG_SECONDS*.9,routes,nodes);
 const near=scenicChapter(SCENIC_LEG_SECONDS*.99,routes,nodes);
 assert.equal(early.arrival,0);
 assert.ok(approach.arrival>0&&approach.arrival<near.arrival);
 assert.ok(near.arrival<=1);
 assert.equal(approach.phase,'APPROACH');
 assert.match(approach.meta,/Not a live mission/);
 assert.doesNotMatch(approach.meta,/verified heartbeat observed|completed job/i);
});
test('source-independent deterministic chapters fail closed for invalid input',()=>{
 for(const t of [-1,Infinity,NaN])assert.throws(()=>scenicChapter(t,routes,nodes));
 assert.throws(()=>scenicChapter(0,[],nodes));
 assert.throws(()=>scenicChapter(0,[['systemia','unknown']],nodes));
 assert.throws(()=>scenicChapter(0,[['systemia']],nodes));
});
