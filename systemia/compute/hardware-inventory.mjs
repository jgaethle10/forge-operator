import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function nonNegative(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,n):0;
}

export function parseNvidiaSmiInventory(stdout=''){
  const gpus=[];
  for(const raw of String(stdout||'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line) continue;
    const match=line.match(/^(.*),\s*([0-9.]+)\s*$/);
    if(!match) continue;
    const name=match[1].trim();
    const memoryMb=nonNegative(match[2]);
    if(!name||!memoryMb) continue;
    gpus.push({name,memory_mb:Math.round(memoryMb)});
  }
  return gpus;
}

function storage(root,fsModule){
  try{
    if(typeof fsModule.statfsSync!=='function') return null;
    const stat=fsModule.statfsSync(root);
    const blockSize=Number(stat.bsize||stat.frsize||0);
    const availableBlocks=Number(stat.bavail??stat.bfree??0);
    if(!Number.isFinite(blockSize)||!Number.isFinite(availableBlocks)) return null;
    return Math.max(0,(blockSize*availableBlocks)/(1024**3));
  }catch{
    return null;
  }
}

export function detectHardwareCapacity({
  root='.',
  osModule=os,
  fsModule=fs,
  run=spawnSync,
}={}){
  const cpuUnits=Math.max(1,Number(osModule.cpus?.()?.length||1));
  const memoryMb=Math.max(64,Math.floor(Number(osModule.totalmem?.()||0)/1024/1024));
  const storageGb=storage(root,fsModule);

  let nvidia=[];
  let gpuProbe='unavailable';
  try{
    const result=run(
      'nvidia-smi',
      ['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],
      {encoding:'utf8',timeout:1500,windowsHide:true}
    );
    if(result?.status===0){
      nvidia=parseNvidiaSmiInventory(result.stdout);
      gpuProbe=nvidia.length?'observed_nvidia_smi':'observed_no_nvidia_gpu';
    }
  }catch{}

  const gpuModels=[...new Set(nvidia.map((gpu)=>gpu.name.toLowerCase()))];
  const vramMb=nvidia.reduce((sum,gpu)=>sum+gpu.memory_mb,0);

  return {
    schema:'evercraft.compute.hardware-capacity.v1',
    cpu_units:cpuUnits,
    memory_mb:memoryMb,
    storage_gb:storageGb==null?0:Number(storageGb.toFixed(2)),
    gpu_units:nvidia.length,
    vram_mb:vramMb,
    gpu_models:gpuModels,
    gpu_inventory:nvidia,
    evidence:{
      cpu:'os.cpus',
      memory:'os.totalmem',
      storage:storageGb==null?'unavailable':'fs.statfs',
      gpu:gpuProbe,
    },
    observed_at:new Date().toISOString(),
  };
}
