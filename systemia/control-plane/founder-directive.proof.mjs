import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFounderDirective } from './founder-directive.mjs';
import { admitMission } from './control-plane.mjs';

const known = [{mission_key:'canonical-existing-001',status:'active'}];
const draft = {
  directive_key:'draft-one-organism',
  canonical_mission_key:'canonical-existing-001',
  title:'Connect existing capabilities end to end',
  intent:'Map the disconnected mission handoffs and verify a safe recipient-visible delivery with independent receipts.',
  state:'draft',
  authorization_refs:['forged-from-client'],
  external_writes_authorized:true,
};

test('reuses an existing active canonical mission and yields deterministic work',()=>{
  const first=prepareFounderDirective({draft,canonicalMissions:known});
  const second=prepareFounderDirective({draft,canonicalMissions:known});
  assert.equal(first.mission_key,'canonical-existing-001');
  assert.equal(first.work_key,second.work_key);
  assert.match(first.work_key,/^founder-integration-[a-f0-9]{24}$/);
  assert.equal(first.mission_created,false);
  assert.equal(first.admitted,false);
  assert.equal(first.execution_authority_granted,false);
  assert.equal(first.delivered,false);
  assert.equal(first.request.mission_key,first.mission_key);
  assert.deepEqual(first.request.tasks[0].dependency_keys,[]);
});

test('untrusted draft cannot smuggle authority into the canonical request',()=>{
  const packet=prepareFounderDirective({draft,canonicalMissions:known});
  assert.equal(packet.request.tasks[0].authorization_refs,undefined);
  assert.equal(packet.request.emergency_direct_dispatch,undefined);
  assert.equal(packet.request.tasks[0].external_writes_authorized,undefined);
  const planned=admitMission({request:packet.request,now:new Date('2026-10-14T00:00:00Z')});
  assert.equal(planned.receipt.mission_key,packet.mission_key);
  assert.equal(planned.receipt.execution_authority_granted,false);
  assert.equal(planned.dispatch[0].execution_authority_granted,false);
  assert.equal(planned.receipt.direct_specialist_dispatch_granted,false);
});

test('unknown, duplicated, closed, and missing canonical missions fail closed',()=>{
  for(const snapshot of [[],[known[0],known[0]],[{...known[0],status:'closed'}]]) {
    assert.throws(()=>prepareFounderDirective({draft,canonicalMissions:snapshot}),/canonical_existing_active_mission_required/);
  }
  assert.throws(()=>prepareFounderDirective({draft}),/trusted_canonical_mission_snapshot_required/);
});

test('only bounded draft inputs prepare; edits change work identity',()=>{
  assert.throws(()=>prepareFounderDirective({draft:{...draft,state:'admitted_receipted'},canonicalMissions:known}),/only_unadmitted_drafts/);
  assert.throws(()=>prepareFounderDirective({draft:{...draft,intent:'short'},canonicalMissions:known}),/founder_directive_invalid_scope/);
  const changed=prepareFounderDirective({draft:{...draft,intent:draft.intent+' Confirm original integrity.'},canonicalMissions:known});
  const original=prepareFounderDirective({draft,canonicalMissions:known});
  assert.notEqual(changed.work_key,original.work_key);
});
