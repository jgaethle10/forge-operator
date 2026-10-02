import assert from 'node:assert/strict';
import { detectHardwareCapacity, parseNvidiaSmiInventory } from './hardware-inventory.mjs';

const parsed=parseNvidiaSmiInventory(
  'NVIDIA RTX 4090, 24564\nNVIDIA RTX PRO 6000 Blackwell, 97887\n'
);
assert.equal(parsed.length,2);
assert.equal(parsed[0].memory_mb,24564);
assert.equal(parsed[1].name,'NVIDIA RTX PRO 6000 Blackwell');

const observed=detectHardwareCapacity({
  root:'/proof',
  osModule:{
    cpus:()=>Array.from({length:12},()=>({})),
    totalmem:()=>64*1024*1024*1024,
  },
  fsModule:{
    statfsSync:()=>({bsize:4096,bavail:10_000_000}),
  },
  run:()=>({
    status:0,
    stdout:'NVIDIA RTX 4090, 24564\nNVIDIA RTX 4090, 24564\n',
  }),
});
assert.equal(observed.cpu_units,12);
assert.equal(observed.memory_mb,65536);
assert.equal(observed.gpu_units,2);
assert.equal(observed.vram_mb,49128);
assert.deepEqual(observed.gpu_models,['nvidia rtx 4090']);
assert.ok(observed.storage_gb>0);
assert.equal(observed.evidence.gpu,'observed_nvidia_smi');

const cpuOnly=detectHardwareCapacity({
  root:'/proof',
  osModule:{cpus:()=>[{}],totalmem:()=>1024*1024*1024},
  fsModule:{statfsSync:()=>{throw new Error('no statfs');}},
  run:()=>({status:127,stdout:''}),
});
assert.equal(cpuOnly.gpu_units,0);
assert.equal(cpuOnly.vram_mb,0);
assert.equal(cpuOnly.storage_gb,0);
assert.equal(cpuOnly.evidence.gpu,'unavailable');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.compute.hardware-capacity-proof.v1',
  cpu_memory_inventory:true,
  storage_inventory:true,
  nvidia_gpu_inventory:true,
  gpu_vram_aggregation:true,
  absence_preserved_without_inventing_gpu:true,
},null,2));
