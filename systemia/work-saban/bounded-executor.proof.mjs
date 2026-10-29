import assert from 'node:assert/strict';
import {executeBoundedTasks} from './bounded-executor.mjs';
let active=0,peak=0;
const events=[];
const tasks=Array.from({length:40},(_,i)=>({
 id:'job-'+i,
 async run(){
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setImmediate(resolve));
   active--;
   if(i===7)throw new Error('expected failure');
   return i*2;
 }
}));
const output=await executeBoundedTasks(tasks,{concurrency:3,onEvent:e=>events.push(e)});
assert.equal(output.results.length,40);
assert.equal(output.results[7].ok,false);
assert.equal(output.results[39].value,78);
assert.equal(output.capacity.requested,40);
assert.equal(output.capacity.admitted,40);
assert.equal(output.capacity.provisioned,40);
assert.equal(output.capacity.verified,39);
assert.equal(output.capacity.failed,1);
assert.equal(output.capacity.running,0);
assert(peak<=3);
assert.equal(events.filter(e=>e.state==='provisioned').length,40);
assert.throws(()=>executeBoundedTasks([{id:'x',run:()=>1},{id:'x',run:()=>2}]),/invalid_or_duplicate_task/);
console.log('Work Saban bounded execution PASS: 40 real local tasks, three-way concurrency, receipts, failure isolation.');
