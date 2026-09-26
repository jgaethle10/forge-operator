import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNationalSessionWorkQueue } from './national-session-sprawl.mjs';

const sourceRegistry=JSON.parse(fs.readFileSync('systemia/rivet/session-source-registry.json','utf8'));
const sabanRegistry=JSON.parse(fs.readFileSync('systemia/saban/multiplication-registry.json','utf8'));
const contract=(sabanRegistry.software||[]).find(item=>item.software_id==='rivet-session-sprawl');

assert.ok(contract,'RIVET session-sprawl Saban contract must exist');
assert.equal(contract.assignment_strategy,'role_item_cartesian');
assert.ok(Array.isArray(contract.roles)&&contract.roles.length>0);

const jurisdictionAndPartnerWork=buildNationalSessionWorkQueue().length;
const sourceWork=(sourceRegistry.sources||[]).length;
const workItems=jurisdictionAndPartnerWork+sourceWork;
const completePassAgents=workItems*contract.roles.length;

assert.ok(completePassAgents>0);
assert.ok(completePassAgents<=Number(contract.max_logical_agents||0),'Complete role-item pass exceeds Saban contract max');
assert.ok(Number(contract.max_work_items||contract.budget?.max_work_items||0)>=workItems,'Work inventory exceeds Saban contract work-item budget');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.session-saban-coverage-proof.v1',
  jurisdiction_and_partner_work:jurisdictionAndPartnerWork,
  source_work:sourceWork,
  work_items:workItems,
  roles:contract.roles.length,
  complete_pass_logical_agents:completePassAgents,
  max_logical_agents:contract.max_logical_agents
}));
