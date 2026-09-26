import assert from 'node:assert/strict';
import { evaluatePublicEdgeFieldMission } from './public-edge-field-mission.mjs';

const completeNode001Mission={
  status:'complete',
  completed_steps:[
    'field_kit_ready',
    'preflight_passed',
    'nodeseed_installed',
    'reboot_persistence_verified',
    'offline_operation_verified',
    'telemetry_verified',
    'field_evidence_candidate_ready',
    'yard_enrollment_verified',
    'live_identity_attested',
    'kaidance_deployed',
    'kaidance_field_pulse_verified',
    'continuity_receipt_verified',
  ],
  human_field_action_required:false,
};

const pendingSpecs={
  products:[
    {slug:'ibmi-rescue',state:'yard_runtime_proven_public_route_pending'},
    {slug:'foundry-app-escape',state:'yard_runtime_proven_public_route_pending'},
    {slug:'site-survive',state:'yard_runtime_proven_public_route_pending'},
  ],
};

const waiting=evaluatePublicEdgeFieldMission({
  node001Mission:{
    status:'waiting_on_field_evidence',
    completed_steps:['field_kit_ready'],
    human_field_action_required:true,
  },
  directPluginSpecs:pendingSpecs,
});
assert.equal(waiting.mission.status,'waiting_on_field_evidence');
assert.equal(waiting.mission.authorized_field_action_required,true);
assert.equal(waiting.mission.systemia_autonomy_ready,false);
assert.equal(waiting.mission.founder_login_required,false);

const fieldReady=evaluatePublicEdgeFieldMission({
  node001Mission:completeNode001Mission,
  directPluginSpecs:pendingSpecs,
});
assert.equal(fieldReady.mission.status,'ready_for_systemia');
assert.equal(fieldReady.mission.field_verified,true);
assert.equal(fieldReady.mission.systemia_autonomy_ready,true);

const edgeActive=evaluatePublicEdgeFieldMission({
  node001Mission:fieldReady.mission.field_verified?completeNode001Mission:null,
  edgeWatch:{
    action:'healthy',
    field_verified:true,
    route_verified:true,
    receipt_hash:'sha256:'+'1'.repeat(64),
    field_enrollment_receipt:'sha256:'+'2'.repeat(64),
  },
  directPluginSpecs:pendingSpecs,
});
assert.equal(edgeActive.mission.status,'public_edge_active_external_canary_pending');
assert.equal(edgeActive.mission.public_route_verified,true);
assert.equal(edgeActive.mission.external_canary_verified,false);

const verifiedCanary={
  verified:true,
  state:'public_https_verified',
  field_enrollment_verified:true,
  public_https_verified:true,
  deployment_receipt_ref:'sha256:'+'3'.repeat(64),
  field_enrollment_receipt_ref:'sha256:'+'4'.repeat(64),
  public_edge_admission_receipt_ref:'sha256:'+'5'.repeat(64),
};

const promotionPending=evaluatePublicEdgeFieldMission({
  node001Mission:completeNode001Mission,
  edgeWatch:{
    action:'healthy',
    field_verified:true,
    route_verified:true,
  },
  externalCanary:verifiedCanary,
  directPluginSpecs:pendingSpecs,
});
assert.equal(promotionPending.mission.status,'public_https_verified_promotion_pending');

const registryPendingSpecs={
  products:pendingSpecs.products.map((p)=>({
    ...p,
    state:'public_https_verified_registry_pending',
    registry_name:'io.github.jgaethle10/'+p.slug,
    mcp_url:'https://specialists.example/mcp/'+p.slug,
  })),
};
const registryPending=evaluatePublicEdgeFieldMission({
  node001Mission:completeNode001Mission,
  edgeWatch:{action:'healthy',field_verified:true,route_verified:true},
  externalCanary:verifiedCanary,
  directPluginSpecs:registryPendingSpecs,
});
assert.equal(registryPending.mission.status,'public_https_verified_registry_pending');

const publishedSpecs={
  products:registryPendingSpecs.products.map((p)=>({
    ...p,
    state:'registry_published_direct_mcp_existing',
  })),
};
const complete=evaluatePublicEdgeFieldMission({
  node001Mission:completeNode001Mission,
  edgeWatch:{action:'healthy',field_verified:true,route_verified:true},
  externalCanary:verifiedCanary,
  directPluginSpecs:publishedSpecs,
});
assert.equal(complete.mission.status,'complete');
assert.equal(complete.mission.all_registry_published,true);
assert.equal(complete.mission_snapshot.counts.changed,0);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.public-edge.field-mission-proof.v1',
  waiting_on_field_evidence:true,
  automatic_systemia_handoff:true,
  external_canary_gate:true,
  promotion_gate:true,
  registry_publication_gate:true,
  founder_login_required:false,
},null,2));
