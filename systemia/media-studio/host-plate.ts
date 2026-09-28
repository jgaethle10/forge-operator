import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface HostPlatePrepInput {
  schema:'evercraft.fallen.host-plate-prep.v1';
  id:string;
  inputPath:string;
  outputPath:string;
  sourceRefs:string[];
  identityEvidenceRefs:string[];
  alreadyAlpha?:boolean;
  keyColor?:string;
  similarity?:number;
  blend?:number;
}

export interface HostPlateReceipt {
  schema:'evercraft.fallen.host-plate-receipt.v1';
  id:string;
  inputSha256:string;
  outputSha256:string;
  outputPath:string;
  ffmpegArgs:string[];
  identityEvidenceRefs:string[];
  sourceRefs:string[];
  boundaries:{
    alphaOutput:true;
    identityEvidenceRequired:true;
    syntheticIdentityGenerationPerformed:false;
    audioRemoved:true;
  };
  createdAt:string;
}

function sha256(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function clamp(value:number|undefined,fallback:number,min:number,max:number){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

function validateColor(value:string|undefined){
  const raw=(value??'00FF00').replace(/^#/,'').toUpperCase();
  if(!/^[0-9A-F]{6}$/.test(raw)) throw new Error('host_plate_key_color_invalid');
  return raw;
}

export function buildHostPlateFfmpegArgs(input:HostPlatePrepInput){
  const similarity=clamp(input.similarity,.18,.01,1);
  const blend=clamp(input.blend,.08,0,1);
  const keyColor=validateColor(input.keyColor);
  const filter=input.alreadyAlpha
    ? 'format=yuva420p'
    : `chromakey=0x${keyColor}:${similarity}:${blend},format=yuva420p`;

  return [
    '-y',
    '-i',path.resolve(input.inputPath),
    '-vf',filter,
    '-an',
    '-c:v','libvpx-vp9',
    '-pix_fmt','yuva420p',
    '-auto-alt-ref','0',
    '-metadata:s:v:0','alpha_mode=1',
    '-row-mt','1',
    '-deadline','good',
    '-cpu-used','2',
    path.resolve(input.outputPath),
  ];
}

function validate(input:HostPlatePrepInput){
  if(input.schema!=='evercraft.fallen.host-plate-prep.v1') throw new Error('host_plate_schema_invalid');
  if(!input.id?.trim()) throw new Error('host_plate_id_missing');
  if(!input.inputPath?.trim()) throw new Error('host_plate_input_missing');
  if(!input.outputPath?.trim()) throw new Error('host_plate_output_missing');
  if(!input.sourceRefs?.length) throw new Error('host_plate_source_refs_missing');
  if(!input.identityEvidenceRefs?.length) throw new Error('host_plate_identity_evidence_missing');
  if(path.resolve(input.inputPath)===path.resolve(input.outputPath)) throw new Error('host_plate_output_must_differ');
}

export function prepareHostPlate(input:HostPlatePrepInput):HostPlateReceipt{
  validate(input);
  const source=path.resolve(input.inputPath);
  const output=path.resolve(input.outputPath);
  if(!fs.existsSync(source)) throw new Error('host_plate_input_not_found');
  fs.mkdirSync(path.dirname(output),{recursive:true});

  const args=buildHostPlateFfmpegArgs(input);
  const result=spawnSync('ffmpeg',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.error) throw new Error(`host_plate_ffmpeg_failed:${result.error.message}`);
  if(result.status!==0) throw new Error(`host_plate_ffmpeg_failed:${String(result.stderr||'unknown').slice(0,2000)}`);
  if(!fs.existsSync(output)||!fs.statSync(output).size) throw new Error('host_plate_output_empty');

  return {
    schema:'evercraft.fallen.host-plate-receipt.v1',
    id:input.id,
    inputSha256:sha256(source),
    outputSha256:sha256(output),
    outputPath:output,
    ffmpegArgs:args,
    identityEvidenceRefs:[...input.identityEvidenceRefs],
    sourceRefs:[...input.sourceRefs],
    boundaries:{
      alphaOutput:true,
      identityEvidenceRequired:true,
      syntheticIdentityGenerationPerformed:false,
      audioRemoved:true,
    },
    createdAt:new Date().toISOString(),
  };
}
