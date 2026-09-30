import test from 'node:test'; import assert from 'node:assert/strict';
import {planRepairUnit,repairPressure} from './repair-unit.mjs';
test('active automatable incidents become bounded repair work',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'github_workflow_failed'}]);assert.equal(p.authority,'bounded_autonomous');assert.equal(repairPressure(p,{attempts:0}).next,'repair');assert.equal(repairPressure(p,{attempts:3}).next,'quarantine_and_escalate');});
test('human gates never auto mutate',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'x',human_gate_required:true}]);assert.equal(p.authority,'human_gate');});
