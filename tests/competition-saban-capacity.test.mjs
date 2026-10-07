import test from "node:test";
import assert from "node:assert/strict";
import {
  competitionWorkerDemand,
  buildCompetitionCapacityMissionSnapshot,
  discoverCompetitionWorkerCapacity,
  ensureCompetitionBrowserCapacity,
} from "../systemia/competition/saban-capacity-runtime.mjs";
import { createEvercraftBrokerMarketAdapter } from "../systemia/saban/markets/evercraft-broker.mjs";

function node({
  authorized=true,
  session_attestation_verified=true,
  zero_cost=true,
  workload=true,
}={}){
  return {
    node_id:"node-free-1",
    device_fingerprint:"fp-1",
    connected:true,
    last_seen_at:new Date().toISOString(),
    capacity:{
      protocol:"evercraft.capacity.v1",
      runtime:"Evercraft Compute",
      authorized,
      session_attestation_verified,
      zero_cost,
      attestation_supported:true,
      device_fingerprint:"fp-1",
      placement_labels:["persistent-storage","personal-compute"],
      supported_workloads:workload?["systemia.evercraft-web-browser.v1"]:[],
      capacity_hint:{
        cpu_units:8,
        memory_mb:16384,
        storage_gb:250,
        gpu_count:0,
      },
    },
  };
}
const emptyPrivateCapacity={
  async listPrivateCapacityNodes(){
    return {
      nodes:[],
      receipt:{receipt_hash:"sha256:local-yard-empty"},
    };
  },
  async privateCapacityGrant(){
    throw new Error("private_capacity_grant_should_not_run");
  },
};

function localGrant({
  allocatorToken="local-yard-secret",
  nodeId="node-free-1",
}={}){
  const grant={
    node_id:nodeId,
    device_fingerprint:"fp-1",
    capacity_endpoint:"https://local-capacity.example.test",
    receipt_hash:"sha256:local-yard-grant",
  };
  Object.defineProperty(grant,"runtime_authority",{
    value:Object.freeze({allocator_token:allocatorToken}),
    enumerable:false,
  });
  return grant;
}

test("competition worker demand is explicit, persistent, and zero-spend",()=>{
  const demand=competitionWorkerDemand();
  assert.equal(demand.workload_class,"systemia.evercraft-web-browser.v1");
  assert.equal(demand.container_image,"ghcr.io/jgaethle10/evercraft-browser-worker:main");
  assert.equal(demand.container_image.endsWith(":latest"),false);
  assert.equal(demand.resources.cpu_units,2);
  assert.equal(demand.resources.memory_mb,3072);
  assert.equal(demand.placement.require_persistent_storage,true);
  assert.equal(demand.economics.max_total_usd,0);
  assert.equal(demand.economics.max_hourly_usd,0);
  assert.equal(demand.negotiation_level,"lease");
});

test("broker refuses connected nodes that are not authorized and attested",async()=>{
  let grants=0;
  const yard={
    async listRemoteCapacityNodes(){
      return {nodes:[node({authorized:false}),node({session_attestation_verified:false})]};
    },
    async remoteCapacityGrant(){
      grants+=1;
      throw new Error("grant_should_not_run");
    },
  };
  const adapter=createEvercraftBrokerMarketAdapter({
    yard,
    brokerDeploymentId:"broker-proof",
  });
  const result=await adapter.discover({demand:competitionWorkerDemand()});
  assert.equal(result.offers.length,0);
  assert.equal(result.receipt.authorized_zero_cost_offer_count,0);
  assert.equal(grants,0);
});

test("Saban acquires an authorized zero-cost competition NodeSeed",async()=>{
  const allocatorToken="secret-allocator-token";
  const yard={
    ...emptyPrivateCapacity,
    async listRemoteCapacityNodes(){return {nodes:[node()]};},
    async remoteCapacityGrant(_deploymentId,nodeId){
      assert.equal(nodeId,"node-free-1");
      return {
        node_id:"node-free-1",
        device_fingerprint:"fp-1",
        capacity_endpoint:"https://capacity.example.test/nodes/node-free-1",
        allocator_token:allocatorToken,
        control_grant_receipt_hash:"sha256:grant",
        public_route_receipt_hash:"sha256:route",
      };
    },
  };
  const acquired=await discoverCompetitionWorkerCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
  });
  assert.equal(acquired.state,"capacity_acquired");
  assert.equal(acquired.lease.zero_cost,true);
  assert.equal(acquired.lease.execution_ready,true);
  assert.equal(acquired.lease.provider_id,"node-free-1");
  assert.equal(JSON.stringify(acquired).includes(allocatorToken),false);
});

test("Saban hands acquired capacity to Yard and deploys the browser worker",async()=>{
  const allocatorToken="secret-allocator-token";
  let deployed=null;
  const yard={
    ...emptyPrivateCapacity,
    deploymentStatus(){return null;},
    async listRemoteCapacityNodes(){return {nodes:[node()]};},
    async remoteCapacityGrant(){
      return {
        node_id:"node-free-1",
        device_fingerprint:"fp-1",
        capacity_endpoint:"https://capacity.example.test/nodes/node-free-1",
        allocator_token:allocatorToken,
        control_grant_receipt_hash:"sha256:grant",
        public_route_receipt_hash:"sha256:route",
      };
    },
    async deployRelease(input){
      deployed=input;
      assert.equal(input.workloadClass,"systemia.evercraft-web-browser.v1");
      assert.equal(input.allocatorToken,allocatorToken);
      assert.equal(input.input.final_submission_authority,false);
      assert.equal(input.input.payment_authority,false);
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
          health_state:"healthy",
          route_verification:"private_browser_health_verified",
        },
      };
    },
  };

  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });
  assert.ok(deployed);
  assert.equal(receipt.state,"deployed_zero_spend_capacity");
  assert.equal(receipt.capacity_node_id,"node-free-1");
  assert.equal(receipt.payment_attempted,false);
  assert.equal(receipt.authority_material_persisted,false);
  assert.equal(JSON.stringify(receipt).includes(allocatorToken),false);
});

test("no authorized free node fails closed without asking for spend",async()=>{
  const yard={
    ...emptyPrivateCapacity,
    deploymentStatus(){return null;},
    async listRemoteCapacityNodes(){return {nodes:[node({zero_cost:false})]};},
    async remoteCapacityGrant(){throw new Error("not_expected");},
  };
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });
  assert.equal(receipt.state,"held_no_authorized_zero_spend_capacity");
  assert.equal(receipt.paid_market_order_authorized,false);
  assert.equal(receipt.paid_lease_authorized,false);
  assert.equal(receipt.next_action,"continue_saban_capacity_discovery");
});


test("resident cycle renews an already-ready competition worker lease",async()=>{
  let renewCalls=0;
  let grants=0;
  const yard={
    deploymentStatus(){
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:existing-deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
          health_state:"healthy",
        },
      };
    },
    async renewDeploymentLease(deploymentId,{ttlMs}={}){
      renewCalls+=1;
      assert.equal(deploymentId,"competition-browser-worker");
      assert.equal(ttlMs,30*60_000);
      return {
        ok:true,
        expires_at:"2026-10-06T07:00:00.000Z",
        receipt_hash:"sha256:renewal",
      };
    },
    async listRemoteCapacityNodes(){
      throw new Error("discovery_should_not_run_for_ready_worker");
    },
    async remoteCapacityGrant(){
      grants+=1;
      throw new Error("grant_should_not_run_for_ready_worker");
    },
  };
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });
  assert.equal(receipt.state,"renewed_ready");
  assert.equal(receipt.lease_renewal_receipt_hash,"sha256:renewal");
  assert.equal(renewCalls,1);
  assert.equal(grants,0);
});

test("missing immutable release is held before Saban issues a capacity grant",async()=>{
  let discoveryCalls=0;
  let grants=0;
  const yard={
    deploymentStatus(){return null;},
    async listRemoteCapacityNodes(){
      discoveryCalls+=1;
      return {nodes:[node()]};
    },
    async remoteCapacityGrant(){
      grants+=1;
      throw new Error("grant_should_not_run_without_release");
    },
  };
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
    releaseRef:"",
  });
  assert.equal(receipt.state,"held_immutable_release_missing");
  assert.equal(discoveryCalls,0);
  assert.equal(grants,0);
});


test("competition capacity mission snapshot exposes state without private topology",()=>{
  const snapshot=buildCompetitionCapacityMissionSnapshot({
    schema:"evercraft.systemia.competition-saban-capacity.v1",
    state:"deployed_zero_spend_capacity",
    observed_at:"2026-10-07T01:40:00.000Z",
    receipt_hash:"sha256:"+"a".repeat(64),
    deployment_receipt_hash:"sha256:"+"b".repeat(64),
    capacity_node_id:"private-node-name",
    acquired_provider_id:"private-provider-name",
    capacity_endpoint:"https://private-capacity.example.test",
    allocator_token:"do-not-leak",
  });
  assert.equal(snapshot.schema,"evercraft.kaidance.mission-snapshot.v1");
  assert.equal(snapshot.state,"healthy");
  assert.equal(snapshot.zero_spend_capacity_ready,true);
  assert.equal(snapshot.founder_action_required,false);
  assert.equal(snapshot.human_gate_required,false);
  assert.equal(snapshot.paid_capacity_authorized,false);
  assert.equal(snapshot.privacy.node_identity_exposed,false);
  assert.equal(snapshot.privacy.capacity_endpoint_exposed,false);
  assert.equal(snapshot.privacy.allocator_authority_exposed,false);
  const encoded=JSON.stringify(snapshot);
  assert.equal(encoded.includes("private-node-name"),false);
  assert.equal(encoded.includes("private-provider-name"),false);
  assert.equal(encoded.includes("private-capacity.example.test"),false);
  assert.equal(encoded.includes("do-not-leak"),false);
});

test("missing zero-spend capacity stays a team-held state, not a Jesse gate",()=>{
  const snapshot=buildCompetitionCapacityMissionSnapshot({
    state:"held_no_authorized_zero_spend_capacity",
    observed_at:"2026-10-07T01:40:00.000Z",
    discovered_offer_count:0,
    next_action:"continue_saban_capacity_discovery",
  });
  assert.equal(snapshot.state,"held");
  assert.equal(snapshot.zero_spend_capacity_ready,false);
  assert.equal(snapshot.founder_action_required,false);
  assert.equal(snapshot.human_gate_required,false);
  assert.equal(snapshot.next_action,"continue_saban_capacity_discovery");
});


test("Saban prefers freshly attested local Yard capacity over remote broker capacity",async()=>{
  const allocatorToken="local-yard-secret";
  let remoteGrants=0;
  let localGrants=0;
  const yard={
    async listPrivateCapacityNodes(){
      return {
        nodes:[node()],
        receipt:{receipt_hash:"sha256:local-yard-inventory"},
      };
    },
    async privateCapacityGrant(nodeId){
      localGrants+=1;
      assert.equal(nodeId,"node-free-1");
      return localGrant({allocatorToken,nodeId});
    },
    async listRemoteCapacityNodes(){
      return {nodes:[{
        ...node(),
        node_id:"remote-free-1",
        device_fingerprint:"fp-remote",
        capacity:{
          ...node().capacity,
          device_fingerprint:"fp-remote",
        },
      }]};
    },
    async remoteCapacityGrant(){
      remoteGrants+=1;
      throw new Error("remote_grant_should_not_run_when_local_yard_wins");
    },
  };
  const acquired=await discoverCompetitionWorkerCapacity({
    yard,
    brokerDeploymentId:"broker-proof",
  });
  assert.equal(acquired.state,"capacity_acquired");
  assert.equal(acquired.lease.market,"evercraft-yard");
  assert.equal(acquired.lease.provider_id,"node-free-1");
  assert.equal(acquired.lease.zero_cost,true);
  assert.equal(localGrants,1);
  assert.equal(remoteGrants,0);
  assert.equal(JSON.stringify(acquired).includes(allocatorToken),false);
});

test("local Yard capacity can deploy the competition worker with no remote broker",async()=>{
  const allocatorToken="local-yard-secret";
  let deployed=null;
  const yard={
    deploymentStatus(){return null;},
    async listPrivateCapacityNodes(){
      return {
        nodes:[node()],
        receipt:{receipt_hash:"sha256:local-yard-inventory"},
      };
    },
    async privateCapacityGrant(nodeId){
      return localGrant({allocatorToken,nodeId});
    },
    async deployRelease(input){
      deployed=input;
      assert.equal(input.allocatorToken,allocatorToken);
      assert.equal(input.workloadClass,"systemia.evercraft-web-browser.v1");
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:local-browser-deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
          health_state:"healthy",
          route_verification:"private_browser_health_verified",
        },
      };
    },
  };
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });
  assert.ok(deployed);
  assert.equal(receipt.state,"deployed_zero_spend_capacity");
  assert.equal(receipt.capacity_node_id,"node-free-1");
  assert.equal(receipt.payment_attempted,false);
  assert.equal(JSON.stringify(receipt).includes(allocatorToken),false);
});

test("non-zero-spend private Yard capacity is invisible to the autonomous competition lease",async()=>{
  let privateGrants=0;
  const yard={
    deploymentStatus(){return null;},
    async listPrivateCapacityNodes(){
      return {
        nodes:[node({zero_cost:false})],
        receipt:{receipt_hash:"sha256:local-yard-paid-inventory"},
      };
    },
    async privateCapacityGrant(){
      privateGrants+=1;
      throw new Error("paid_private_capacity_must_not_be_granted");
    },
  };
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });
  assert.equal(receipt.state,"held_no_authorized_zero_spend_capacity");
  assert.equal(receipt.paid_market_order_authorized,false);
  assert.equal(receipt.paid_lease_authorized,false);
  assert.equal(privateGrants,0);
});


test("stale Browser Worker authority is invalidated and reacquired in the same resident cycle",async()=>{
  const allocatorToken="fresh-local-yard-secret";
  let renewCalls=0;
  let stopCalls=0;
  let invalidations=0;
  let deployCalls=0;
  const yard={
    deploymentStatus(){
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:stale-browser-deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
          health_state:"healthy",
        },
      };
    },
    async renewDeploymentLease(){
      renewCalls+=1;
      throw new Error("old_nodeseed_unreachable");
    },
    async stopDeployment(){
      stopCalls+=1;
      throw new Error("old_nodeseed_unreachable");
    },
    invalidateDeployment(deploymentId,{reason,evidence}={}){
      invalidations+=1;
      assert.equal(deploymentId,"competition-browser-worker");
      assert.equal(reason,"competition_lease_renewal_failed");
      assert.equal(evidence.error_code,"old_nodeseed_unreachable");
      return {
        ok:true,
        deployment_id:deploymentId,
        state:"invalidated",
        receipt_hash:"sha256:stale-invalidation",
      };
    },
    async listPrivateCapacityNodes(){
      return {
        nodes:[node()],
        receipt:{receipt_hash:"sha256:fresh-local-yard-inventory"},
      };
    },
    async privateCapacityGrant(nodeId){
      assert.equal(nodeId,"node-free-1");
      return localGrant({allocatorToken,nodeId});
    },
    async deployRelease(input){
      deployCalls+=1;
      assert.equal(input.allocatorToken,allocatorToken);
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:fresh-browser-deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
          health_state:"healthy",
          route_verification:"private_browser_health_verified",
        },
      };
    },
  };

  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });

  assert.equal(receipt.state,"deployed_zero_spend_capacity");
  assert.equal(receipt.stale_deployment_recovered,true);
  assert.equal(
    receipt.stale_invalidation_receipt_hash,
    "sha256:stale-invalidation"
  );
  assert.equal(
    receipt.previous_deployment_receipt_hash,
    "sha256:stale-browser-deployment"
  );
  assert.equal(renewCalls,1);
  assert.equal(stopCalls,1);
  assert.equal(invalidations,1);
  assert.equal(deployCalls,1);
  assert.equal(JSON.stringify(receipt).includes(allocatorToken),false);
});

test("stale Browser Worker invalidation can hold safely when no fresh zero-spend node exists",async()=>{
  let invalidations=0;
  const yard={
    deploymentStatus(){
      return {
        state:"ready",
        receipt:{
          receipt_hash:"sha256:stale-browser-deployment",
          capacity_node_id:"node-free-1",
          workload_class:"systemia.evercraft-web-browser.v1",
        },
      };
    },
    async renewDeploymentLease(){
      throw new Error("old_lease_missing");
    },
    async stopDeployment(){
      throw new Error("old_lease_missing");
    },
    invalidateDeployment(){
      invalidations+=1;
      return {
        ok:true,
        state:"invalidated",
        receipt_hash:"sha256:stale-invalidation",
      };
    },
    async listPrivateCapacityNodes(){
      return {
        nodes:[],
        receipt:{receipt_hash:"sha256:no-fresh-capacity"},
      };
    },
    async privateCapacityGrant(){
      throw new Error("private_capacity_grant_should_not_run_without_offer");
    },
  };

  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId:"",
    releaseRef:"0123456789abcdef0123456789abcdef01234567",
  });

  assert.equal(receipt.state,"held_no_authorized_zero_spend_capacity");
  assert.equal(receipt.stale_deployment_invalidated,true);
  assert.equal(
    receipt.stale_invalidation_receipt_hash,
    "sha256:stale-invalidation"
  );
  assert.equal(receipt.paid_lease_authorized,false);
  assert.equal(invalidations,1);
});
