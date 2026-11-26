import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessLightForgeProject} from '../systemia/organism/lightforge-development-intake.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../registry/kaidance-lightforge-development.v1.json',import.meta.url),'utf8'));
test('LightForge remains an unpublished, blocked product with stable review handoff',()=>{
 const a=assessLightForgeProject(manifest),b=assessLightForgeProject(structuredClone(manifest));
 assert.deepEqual(a,b);
 assert.equal(a.report.status,'release_blocked');
 assert.equal(a.report.gates_independently_verified,0);
 assert.equal(a.report.development_worker_dispatched,false);
 assert.equal(a.report.shipping_authorized,false);
 assert.equal(a.report.revenue_verified,false);
 assert.equal(a.candidate.work_key,'lightforge:gate:canonical-source');
 assert.equal(a.candidate.execution_authorized,false);
});
test('LightForge rejects invented green evidence and unsafe authority',()=>{
 for(const change of [
   x=>{x.gates[0].state='verified'},
   x=>{x.gates[0].key='../escape'},
   x=>{x.gates.push({...x.gates[0]})},
   x=>{x.gates[0].priority=-1},
   x=>{x.authority.write_code=true},
   x=>{x.commercial_status='sell_now'},
   x=>{x.deployment_status='production'}
 ]) {const bad=structuredClone(manifest);change(bad);assert.throws(()=>assessLightForgeProject(bad));}
});
