import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftContextFabric } from '../context-fabric/fabric.mjs';
import { ingestWorldstateIntoContextFabric } from './context-fabric-adapter.mjs';
import {
  worldstateSnapshotFromContextFabric,
  realityDeltaFromContextFabric
} from './context-reader.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldstate-context-proof-'));
const passportStateDir = path.join(root, 'passport');
const contextStateDir = path.join(root, 'context');
const actor = 'systemia:worldstate-proof';
const at = '2026-09-29T18:55:00.000Z';

try {
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  passport.issueGrant({
    idempotency_key:'worldstate-proof-grant',
    subject_ref:actor,
    issuer_ref:'systemia:proof-authority',
    product:'evercraft-context',
    scopes:['context.write.worldstate','context.read.worldstate'],
    starts_at:'2026-09-29T00:00:00.000Z',
    ends_at:'2027-09-29T00:00:00.000Z',
    max_delegation_depth:0,
    authority_state:'system_policy_authorized',
    authority_receipt_ref:'proof:worldstate-authority',
    purpose:'Worldstate integration proof'
  });

  const fabric = new EvercraftContextFabric({
    stateDir: contextStateDir,
    passportStateDir
  });

  ingestWorldstateIntoContextFabric({
    fabric,
    actor_ref:actor,
    observation:{
      observation_id:'worldstate-yakima-water-001',
      source_system:'rockies-public-watch',
      source_family:'usgs-water',
      observed_at:'2026-09-29T18:20:00.000Z',
      region_key:'yakima',
      domain:'water',
      kind:'river_state',
      evidence_state:'observed',
      reliability:0.94,
      anomaly_score:0.12,
      summary:'Yakima river state remains near learned baseline.',
      provenance_ref:'public:usgs:yakima-water'
    }
  });

  const unauthorized = fabric.query({
    query:'yakima water',
    namespaces:['worldstate'],
    at
  });
  assert.equal(unauthorized.result_count, 0, 'internal Worldstate context must not leak without Passport authority');

  const scope = {
    name:'Yakima operating context',
    region_keys:['yakima'],
    domains:['water','energy','infrastructure'],
    materiality_threshold:0.4
  };

  const before = worldstateSnapshotFromContextFabric({
    fabric,
    scope,
    actor_ref:actor,
    at
  });
  assert.equal(before.observation_count, 1);
  assert.equal(before.authority.authorized_record_count, 1);
  assert.equal(before.observations[0].observation_id, 'worldstate-yakima-water-001');

  ingestWorldstateIntoContextFabric({
    fabric,
    actor_ref:actor,
    observation:{
      observation_id:'worldstate-yakima-grid-002',
      source_system:'rockies-public-watch',
      source_family:'utility-public-status',
      observed_at:'2026-09-29T19:00:00.000Z',
      region_key:'yakima',
      domains:['energy','infrastructure'],
      kind:'grid_condition',
      evidence_state:'verified',
      reliability:0.98,
      anomaly_score:0.91,
      summary:'Verified grid condition materially departed from learned baseline.',
      provenance_ref:'public:utility:yakima-grid'
    }
  });

  const { current_snapshot, delta } = realityDeltaFromContextFabric({
    fabric,
    previous_snapshot:before,
    scope,
    actor_ref:actor,
    at:'2026-09-29T19:05:00.000Z'
  });

  assert.equal(current_snapshot.observation_count, 2);
  assert.equal(delta.new_observation_count, 1);
  assert.equal(delta.material_change_count, 1);
  assert.equal(delta.material_changes[0].observation_id, 'worldstate-yakima-grid-002');
  assert.equal(delta.material_changes[0].evidence_state, 'verified');
  assert.deepEqual(delta.material_changes[0].provenance_refs, ['public:utility:yakima-grid']);

  console.log(JSON.stringify({
    ok:true,
    unauthorized_result_count:unauthorized.result_count,
    authorized_before_count:before.observation_count,
    authorized_after_count:current_snapshot.observation_count,
    material_delta_count:delta.material_change_count,
    authority_receipt_present:Boolean(current_snapshot.authority.context_packet_receipt)
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
