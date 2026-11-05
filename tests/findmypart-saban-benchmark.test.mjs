import test from 'node:test';import assert from 'node:assert/strict';
import {runBenchmark} from '../scripts/findmypart-saban-benchmark.mjs';
test('Saban benchmark reports real capability limits rather than invented recoveries',()=>{
 const report=runBenchmark();
 assert.equal(report.dataset_size,8);
 assert.equal(report.live_supplier_calls,0);
 assert.equal(report.real_world_recoveries_verified,0);
 assert.ok(report.results.every(x=>x.synthetic&&x.tracks===6&&x.score===0&&!x.release_eligible));
 assert.equal(report.results.find(x=>x.id==='brake-critical').safety_hold,true);
});
