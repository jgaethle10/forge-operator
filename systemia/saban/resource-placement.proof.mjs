import assert from 'node:assert/strict';
import { meetsResourceProfile } from './nodeseed-pool.mjs';

const node={
  placement_labels:['worker','gpu'],
  capacity_hint:{
    cpu_units:16,
    memory_mb:65536,
    storage_gb:900,
    gpu_units:1,
    gpu_count:1,
    vram_mb:24576,
    gpu_models:['nvidia rtx 4090'],
    executables:{ffmpeg:true},
    services:{},
  },
};

assert.equal(meetsResourceProfile(node,{
  minimum_node_cpu_units:8,
  minimum_node_memory_mb:32768,
  minimum_node_storage_gb:100,
  minimum_node_gpu_units:1,
  minimum_node_vram_mb:20000,
  required_gpu_models:['nvidia rtx 4090'],
}).eligible,true);

assert.equal(meetsResourceProfile(node,{
  minimum_node_storage_gb:1000,
}).reason,'insufficient_storage_capacity');

assert.equal(meetsResourceProfile(node,{
  minimum_node_gpu_units:2,
}).reason,'insufficient_gpu_capacity');

assert.equal(meetsResourceProfile(node,{
  minimum_node_vram_mb:48000,
}).reason,'insufficient_vram_capacity');

assert.equal(meetsResourceProfile(node,{
  required_gpu_models:['nvidia h100'],
}).reason,'required_gpu_model_missing');

assert.equal(meetsResourceProfile({
  ...node,
  capacity_hint:{
    ...node.capacity_hint,
    gpu_units:0,
    gpu_count:0,
    vram_mb:0,
    gpu_models:[],
  },
},{
  minimum_node_gpu_units:1,
}).eligible,false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-placement-proof.v1',
  storage_gate:true,
  gpu_count_gate:true,
  vram_gate:true,
  gpu_model_gate:true,
  cpu_only_node_rejected_for_gpu_work:true,
},null,2));
