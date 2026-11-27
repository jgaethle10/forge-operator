import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';

test('REALITY-001 synthetic benchmark preserves exact frame hashes',()=>{
 const p=spawnSync('python3',['research/reality-engine/benchmark.py'],{encoding:'utf8',timeout:10000,maxBuffer:65536});
 assert.ifError(p.error); assert.equal(p.status,0,p.stderr);
 const r=JSON.parse(p.stdout);
 assert.equal(r.schema,'evercraft.reality.benchmark.v1');
 assert.equal(r.exact_match,true);
 assert.equal(r.baseline.tiles_rendered,28800);
 assert.equal(r.temporal.tiles_rendered+r.temporal.tiles_reused,28800);
 assert.ok(r.temporal.tiles_reused>0);
 assert.equal(r.workload.synthetic,true);
 for(const m of [r.baseline,r.temporal])assert.ok(Number.isFinite(m.median_ms)&&Number.isFinite(m.p95_ms));
});
test('REALITY-001 browser script parses without executing browser effects',()=>{
 const html=fs.readFileSync('research/reality-engine/demo.html','utf8');
 const js=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(js);
 new vm.Script(js[1]);
});
