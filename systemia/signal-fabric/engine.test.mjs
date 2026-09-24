import assert from 'node:assert/strict';
import { emptyState, ingest } from './engine.mjs';

let state=emptyState();
const base={company:'Evercraft',product:'AliEV',source:'branch',kind:'ci_workflow',component:'Forge checks',status:'failed',evidence_state:'source_build_green',created_at:'2026-09-24T20:00:00Z'};
let first=ingest(state,base);
state=first.state;
assert.equal(first.decision.severity,'notice');
assert.equal(first.decision.suppressed,false);

let repeat=ingest(state,{...base,created_at:'2026-09-24T20:02:00Z'});
state=repeat.state;
assert.equal(repeat.decision.action,'deduped');
assert.equal(repeat.decision.suppressed,true);
assert.deepEqual(repeat.decision.routes,['ledger']);

let critical=ingest(state,{company:'Evercraft',product:'ForensiScope',source:'canary',kind:'production_outage',component:'api',status:'failed',evidence_state:'live_verified',impact:'production_outage',created_at:'2026-09-24T20:10:00Z'});
state=critical.state;
assert.equal(critical.decision.severity,'critical');
assert.equal(critical.decision.immediate_allowed,true);

for(let i=0;i<3;i++){
  const r=ingest(state,{company:'Evercraft',product:`P${i}`,source:'canary',kind:'production_outage',component:'api',status:'failed',evidence_state:'live_verified',impact:'production_outage',created_at:`2026-09-24T20:1${i+1}:00Z`});
  state=r.state;
  assert.equal(r.decision.suppressed,false);
}
const fifth=ingest(state,{company:'Evercraft',product:'P4',source:'canary',kind:'production_outage',component:'api',status:'failed',evidence_state:'live_verified',impact:'production_outage',created_at:'2026-09-24T20:19:00Z'});
assert.equal(fifth.decision.action,'budget_coalesced');
assert.equal(fifth.decision.immediate_allowed,false);
assert.deepEqual(fifth.decision.routes,['ledger','owner_queue']);

console.log('SIGNAL FABRIC ENGINE PASS');
