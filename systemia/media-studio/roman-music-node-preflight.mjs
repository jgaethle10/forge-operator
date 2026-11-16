#!/usr/bin/env node
/**
 * Read-only, dependency-free local hardware check for Fallen / ACE-Step auditioning.
 * Not a model installer; never downloads weights, invokes inference or transmits
 * hardware details. Intended for Node002 / NextGen (WSL2) and Node001 / Penguin.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const GB=1024**3;
function tryCmd(command,args=[],limit=4000){
 try{return execFileSync(command,args,{encoding:'utf8',timeout:limit,stdio:['ignore','pipe','ignore']}).trim();}
 catch{return null;}
}
function parsePython(s){
 const m=String(s||'').match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
 return m?{major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3])}:null;
}
function parseGpuCsv(s){
 if(!s)return [];
 return s.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
   const cells=line.split(',').map(x=>x.trim());
   if(cells.length<2)return null;
   const vramMiB=Number(cells[1].replace(/[^\d.]/g,''));
   if(!Number.isFinite(vramMiB))return null;
   return {name:cells[0],vram_gb:Number((vramMiB/1024).toFixed(1)),
     driver_version:cells[2]||null};
 }).filter(Boolean);
}
function parseDf(s){
 const lines=String(s||'').trim().split(/\r?\n/);
 const parts=(lines.at(-1)||'').trim().split(/\s+/);
 const availableKb=Number(parts.at(-3));
 return Number.isFinite(availableKb)?Number((availableKb*1024/GB).toFixed(1)):null;
}
export function classifyHardware({gpus=[],python=null,free_disk_gb=null,memory_gb=null,
  ffmpeg=false,ffprobe=false,wsl=false}={}){
 const blockers=[],warnings=[];
 if(!python||python.major!==3||![11,12].includes(python.minor))
  blockers.push('python_3_11_or_3_12_not_detected');
 if(free_disk_gb===null)warnings.push('disk_free_space_unmeasured');
 else if(free_disk_gb<20)warnings.push('free_disk_below_20gb_preferred');
 if(!ffmpeg||!ffprobe)warnings.push('ffmpeg_tools_not_found');
 if(wsl)warnings.push('wsl_gpu_pass_through_must_be_validated');
 const maxVram=Math.max(0,...gpus.map(x=>x.vram_gb));
 let recommended_lane='measure_cpu_fallback_before_installing_model';
 if(maxVram>=12)recommended_lane='ace_step_2b_gpu_candidate_then_quality_benchmark';
 else if(maxVram>=6)recommended_lane='ace_step_2b_offload_candidate';
 else if(maxVram>0)recommended_lane='ace_step_2b_constrained_offload_candidate';
 else warnings.push('gpu_vram_unavailable_or_no_cuda_device');
 if(memory_gb!==null&&memory_gb<8)warnings.push('system_memory_below_8gb');
 return {model_installed_or_running:'NOT_CHECKED',recommended_lane,blockers,warnings,
  deployment_authorized:false,commercial_audio_approved:false};
}
export function collectHardware(){
 const platform=os.platform();
 const ver=tryCmd('python3',['--version'])||tryCmd('python',['--version']);
 const smiArgs=['--query-gpu=name,memory.total,driver_version','--format=csv,noheader,nounits'];
 // NVIDIA documents this location for WSL when nvidia-smi is not on PATH.
 const pathSmi=tryCmd('nvidia-smi',smiArgs);
 const wslSmi=pathSmi===null&&fs.existsSync('/usr/lib/wsl/lib/nvidia-smi')?
   tryCmd('/usr/lib/wsl/lib/nvidia-smi',smiArgs):null;
 const gpus=parseGpuCsv(pathSmi??wslSmi);
 const df=tryCmd('df',['-Pk','.']);
 const memory_gb=Number((os.totalmem()/GB).toFixed(1));
 const wsl=Boolean(process.env.WSL_DISTRO_NAME||
   fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')||/microsoft|wsl/i.test(os.release()));
 const inventory={schema:'evercraft.fallen.node-music-hardware-preflight.v1',
  observed_at:new Date().toISOString(),machine:os.hostname(),platform,architecture:os.arch(),
  wsl,cpu_logical_cores:os.cpus().length,
  memory_gb,free_disk_gb:parseDf(df),
  wsl_gpu_device_visible:fs.existsSync('/dev/dxg'),
  gpu_probe_source:pathSmi!==null?'PATH:nvidia-smi':wslSmi!==null?'WSL:/usr/lib/wsl/lib/nvidia-smi':'NOT_DETECTED',
  python:parsePython(ver),ffmpeg:Boolean(tryCmd('ffmpeg',['-version'])),
  ffprobe:Boolean(tryCmd('ffprobe',['-version'])),gpus,
  caveat:'Read-only local snapshot. A visible GPU and model compatibility do not prove successful music inference.'};
 return {...inventory,decision:classifyHardware(inventory)};
}
function main(){
 const result=collectHardware();
 const json=JSON.stringify(result,null,2)+'\n';
 if(process.argv.length>2){
  if(process.argv[2]!=='--out'||process.argv.length!==4)throw Error('Use --out output.json or no argument');
  const target=path.resolve(process.argv[3]);
  if(fs.existsSync(target))throw Error('Refusing to overwrite a prior hardware report');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,json,{flag:'wx'});
 }
 process.stdout.write(json);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{main();}catch(e){console.error(e.message);process.exitCode=1;}
}
