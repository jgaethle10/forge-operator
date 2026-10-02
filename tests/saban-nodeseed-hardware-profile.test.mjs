import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';
import {sanitizeNodeSeedInventory} from '../systemia/saban/nodeseed-inventory-ingest.mjs';
import {nodeSeedInventoryToComputeOffers} from '../systemia/saban/nodeseed-capacity-offer.mjs';

test('NodeSeed capacity exposes a safe local hardware summary without sensitive identifiers',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nodeseed-hardware-'));
  const node=await startEvercraftComputeNode({
    nodeId:'hardware-proof-node',
    root,
    host:'127.0.0.1',
    port:0,
    allocatorToken:'hardware-proof-token',
    zeroCost:true,
  });
  try{
    const capacity=await (await fetch(node.endpoint+'/v1/capacity')).json();
    const hw=capacity.capacity_hint.hardware;
    assert.equal(hw.schema,'evercraft.compute.safe-hardware-summary.v1');
    assert.equal(hw.cpu.architecture,os.arch());
    assert.ok(hw.cpu.logical_threads>=1);
    assert.ok(capacity.capacity_hint.recommended_concurrency>=1);
    assert.equal(hw.sensitive_identifiers_included,false);
    const raw=JSON.stringify(hw).toLowerCase();
    assert.doesNotMatch(raw,/mac_address|serial_number|disk_uuid|username|hostname/);
  }finally{
    await node.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('safe accelerator telemetry survives broker-style inventory into Saban compute offers',()=>{
  const fingerprint='sha256:'+'7'.repeat(64);
  const safe=sanitizeNodeSeedInventory({
    schema:'evercraft.yard.remote-capacity-nodes.v1',
    count:1,
    nodes:[{
      node_id:'accelerator-node',
      device_fingerprint:fingerprint,
      connected:true,
      last_seen_at:'2026-10-02T06:00:00.000Z',
      capacity:{
        protocol:'evercraft.capacity.v1',
        runtime:'Evercraft Compute',
        supported_workloads:['systemia.render-frame.v1'],
        placement_labels:['accelerated'],
        authorized:true,
        session_attestation_verified:true,
        attestation_supported:true,
        device_fingerprint:fingerprint,
        failure_domain:'render-site-a',
        zero_cost:true,
        public_ingress:false,
        capacity_hint:{
          cpu_units:12,
          memory_mb:32768,
          storage_gb:800,
          recommended_concurrency:6,
          hardware:{
            schema:'evercraft.compute.safe-hardware-summary.v1',
            cpu:{architecture:'x64',model:'Proof CPU',logical_threads:12},
            memory_mb:32768,
            free_storage_gb:800,
            accelerators:{
              gpu_count:2,
              gpu_models:['Proof GPU X','Proof GPU X'],
              detection_state:'observed_local',
            },
            recommended_concurrency:{
              value:6,
              state:'inferred_from_cpu_and_memory',
            },
            sensitive_identifiers_included:false,
          },
          executables:{ffmpeg:true,ffprobe:true},
        },
      },
    }],
  });
  const resolution=nodeSeedInventoryToComputeOffers({inventory:safe,requireZeroCost:true});
  assert.equal(resolution.eligible_count,1);
  const offer=resolution.offers[0];
  assert.equal(offer.resources.gpu_count,2);
  assert.deepEqual(offer.resources.gpu_models,['Proof GPU X','Proof GPU X']);
  assert.equal(offer.metadata.max_concurrency,6);
  assert.equal(offer.metadata.cpu_architecture,'x64');
  assert.equal(offer.metadata.accelerator_detection_state,'observed_local');
  assert.equal(offer.metadata.hardware_measurement_state,'observed_local');
});
