#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { runPoolWithAcquisition } from './distributed-executor.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-resource-field-execution-'));
const allocatorToken='resource-field-proof-token';

function assignment(id){
  return {
    agent_id:id,
    idempotency_key:id+'-idempotency',
    role:'surface_auditor',
    work:{
      kind:'product',
      key:'proof-product',
      source_file:null,
    },
    item:{
      kind:'product',
      key:'proof-product',
      raw:{
        canonical_url:'https://example.com/resource-field-proof',
        intents:['resource','field','proof'],
        authority:'proof',
        boundaries:['public only'],
      },
    },
  };
}

const contract={
  software_id:'chum',
  resources:{
    minimum_node_cpu_units:1,
    minimum_node_memory_mb:512,
  },
  max_attempts_per_job:2,
};

const plan={
  generated_at:new Date().toISOString(),
  lease_seconds:300,
};

let spawnedNode=null;
let spawnCalls=0;

try{
  const dormantCandidate={
    candidate_id:'dormant-owned-node',
    source_kind:'owned_bootstrap_target',
    authority:'owned',
    connected:false,
    attested:false,
    spawn_capable:true,
    workloads:[],
    labels:['worker'],
    transports:[],
    resources:{
      cpu_units:4,
      memory_mb:4096,
      storage_gb:20,
      gpu_units:0,
      vram_mb:0,
    },
  };

  const ownedRun=await runPoolWithAcquisition({
    poolOptions:{
      software:'chum',
      assignments:[assignment('owned-spawn-proof')],
      endpoints:[],
      discover:false,
      allocatorToken:'',
      allocatorTokens:{},
      maxAttempts:2,
      maxConcurrencyPerNode:1,
      timeoutMs:2000,
      assignmentTimeoutMs:10000,
      requestedTtlMs:120000,
    },
    contract,
    plan,
    acquisition:{
      enabled:true,
      candidates:[dormantCandidate],
      spawnAdapters:{
        owned_bootstrap_target:{
          async activate(){
            spawnCalls+=1;
            spawnedNode=await startNodeSeed({
              root:path.join(root,'spawned-owned-node'),
              nodeId:'spawned-owned-node',
              host:'127.0.0.1',
              port:0,
              advertiseHost:'127.0.0.1',
              allocatorToken,
              announce:false,
            });
            const lease={
              execution_ready:true,
              capacity_endpoint:spawnedNode.endpoint,
              receipt:'sha256:spawned-owned-node',
            };
            Object.defineProperty(lease,'runtime_authority',{
              value:Object.freeze({allocator_token:allocatorToken}),
              enumerable:false,
            });
            return lease;
          },
        },
      },
      adapters:[],
    },
  });

  assert.equal(spawnCalls,1);
  assert.equal(ownedRun.poolReceipt.completed_assignments,1);
  assert.equal(ownedRun.poolReceipt.failed_assignments,0);
  assert.equal(ownedRun.acquisition.resource_mode,'resource_field');
  assert.equal(ownedRun.acquisition.acquired_endpoint_count,1);

  await spawnedNode.close();
  spawnedNode=null;

  let marketNode=null;
  let marketDiscoveries=0;
  const market={
    market:'proof-market',
    async discover(){
      marketDiscoveries+=1;
      return {
        offers:[{
          offer_id:'proof-market:node',
          provider_id:'proof-market-node',
          market:'proof-market',
          resources:{
            cpu_units:4,
            memory_mb:4096,
            storage_gb:20,
            gpu_count:0,
            gpu_models:[],
          },
          placement:{},
          trust:{
            uptime_7d:1,
            audited:true,
            valid_version:true,
            attested:false,
          },
          economics:{
            zero_cost:false,
            quoted:true,
            hourly_usd:0.01,
            total_usd:0.01,
          },
          quote_required:false,
        }],
      };
    },
    async lease(){
      marketNode=await startNodeSeed({
        root:path.join(root,'market-node'),
        nodeId:'market-node',
        host:'127.0.0.1',
        port:0,
        advertiseHost:'127.0.0.1',
        allocatorToken,
        announce:false,
      });
      const lease={
        schema:'proof.market-lease.v1',
        execution_ready:true,
        capacity_endpoint:marketNode.endpoint,
        receipt:'sha256:market-node',
      };
      Object.defineProperty(lease,'runtime_authority',{
        value:Object.freeze({allocator_token:allocatorToken}),
        enumerable:false,
      });
      return lease;
    },
  };

  const marketRun=await runPoolWithAcquisition({
    poolOptions:{
      software:'chum',
      assignments:[assignment('market-fallback-proof')],
      endpoints:[],
      discover:false,
      allocatorToken:'',
      allocatorTokens:{},
      maxAttempts:2,
      maxConcurrencyPerNode:1,
      timeoutMs:2000,
      assignmentTimeoutMs:10000,
      requestedTtlMs:120000,
    },
    contract,
    plan,
    acquisition:{
      enabled:true,
      candidates:[],
      adapters:[market],
      leaseAuthority:{
        schema:'evercraft.saban.compute-authority.v1',
        approved:true,
        demand_id:'distributed:chum:'+plan.generated_at,
        allowed_markets:['proof-market'],
        max_total_usd:1,
      },
      max_total_usd:1,
    },
  });

  assert.equal(marketDiscoveries,1);
  assert.equal(marketRun.poolReceipt.completed_assignments,1);
  assert.equal(marketRun.poolReceipt.failed_assignments,0);
  assert.equal(marketRun.acquisition.resource_mode,'compute_exchange');
  assert.equal(marketRun.acquisition.market,'proof-market');
  assert.equal(marketRun.acquisition.provider_id,'proof-market-node');

  await marketNode.close();
  marketNode=null;

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.resource-field-execution-proof.v1',
    zero_initial_capacity:true,
    dormant_owned_machine_bootstrapped:true,
    assignment_executed_on_spawned_owned_node:true,
    empty_local_field_fell_through_to_compute_exchange:true,
    assignment_executed_on_market_node:true,
    no_dead_end_on_initial_capacity_failure:true,
  },null,2));
}finally{
  try{await spawnedNode?.close();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
