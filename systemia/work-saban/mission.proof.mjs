import assert from 'node:assert/strict';
import { composeWorkSabanMission } from './mission.mjs';

const finance = composeWorkSabanMission({ task: 'Analyze monthly sales spreadsheet and prepare a presentation for management' });
assert.equal(finance.schema, 'evercraft.work-saban.mission-proposal.v1');
assert.equal(finance.state, 'proposed_not_admitted');
assert.deepEqual(finance.execution_waves[0], ['director']);
assert(finance.team.some(row => row.id === 'analyst'));
assert(finance.team.some(row => row.id === 'designer'));
assert.deepEqual(finance.execution_waves.at(-1), ['coordinator']);
assert(finance.team.every(row => row.state === 'proposed_not_running'));
assert(finance.team.every(row => row.execution_contract === null));
assert.equal(finance.policies.live_worker_dispatch_allowed, false);

const outreach = composeWorkSabanMission({ task: 'Draft an email to customers explaining the policy update' });
assert(outreach.team.some(row => row.id === 'writer'));
assert(!outreach.team.some(row => row.id === 'analyst'));
assert(outreach.permission_gates.some(row => row.id === 'external-send'));

const unfamiliar = composeWorkSabanMission({ task: 'Please help with this unusual new office assignment' });
assert(unfamiliar.team.some(row => row.id === 'researcher'));
assert.equal(new Set(unfamiliar.team.map(row => row.id)).size, unfamiliar.team.length);

const independent = composeWorkSabanMission({ task: 'Research competition and analyze quarterly financial data' });
assert(independent.execution_waves.some(wave => wave.includes('researcher') && wave.includes('analyst')));

for (const task of ['', 'tiny', 'x'.repeat(4001), 7]) {
  assert.throws(() => composeWorkSabanMission({task}));
}
assert.throws(() => composeWorkSabanMission({task:'Prepare monthly report', attachments: new Array(13).fill('file.csv')}));
assert.throws(() => composeWorkSabanMission({task:'Prepare monthly report', audience:'x'.repeat(121)}));
assert.notEqual(finance.mission_id, outreach.mission_id);
console.log('Work Saban mission formation proof: PASS (proposal only; zero worker execution).');
