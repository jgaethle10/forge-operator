import test from "node:test";
import assert from "node:assert/strict";
import {
  competitionWorkerDemand,
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

test("competition worker demand is explicit, persistent, and zero-spend",()=>{
  const demand=competitionWorkerDemand();
  assert.equal(demand.workload_class,"systemia.evercraft-web-browser.v1");
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
