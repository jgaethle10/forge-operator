#!/usr/bin/env node
// Converts a reviewed World Engine world into exact-tick cinematic WebGPU frame plans.
// Does not render pixels or publish anything.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {buildCinematicCameraSequence,type CinematicCameraTake} from './cinematic-rig.js';
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import type {TextureAsset} from './texture.js';

const hash=(contents:Buffer|string)=>crypto.createHash('sha256').update(contents).digest('hex');
function load<T>(filename:string):{data:T;sha256:string}{
  const contents=fs.readFileSync(path.resolve(filename));
  return {data:JSON.parse(contents.toString('utf8')) as T,sha256:hash(contents)};
}
function main(args:string[]){
  const [worldFile,takeFile,geometriesFile,outputDir,texturesFile]=args;
  if(!worldFile||!takeFile||!geometriesFile||!outputDir)
    throw new Error('Usage: npm run world:cinematic-camera -- <world.json> <take.json> <geometry-array.json> <new-output-directory> [textures-array.json]');
  const world=load<WorldDefinition>(worldFile);
  const take=load<CinematicCameraTake>(takeFile);
  const geometry=load<GeometryAsset[]>(geometriesFile);
  const textures=texturesFile?load<TextureAsset[]>(texturesFile):null;
  const output=path.resolve(outputDir);
  if(fs.existsSync(output))throw new Error('cinematic_camera_output_directory_exists');
  // Build EVERY verified plan before exposing even a partial output directory.
  const sequence=buildCinematicCameraSequence({
    world:world.data,take:take.data,
    geometries:geometry.data,viewport:{width:1920,height:1080},
    textures:textures?.data??[]
  });
  const manifest={
    schema:'evercraft.world-engine.cinematic-camera-export.v1',
    takeId:sequence.takeId,
    worldId:sequence.worldId,
    inputSha256:{world:world.sha256,take:take.sha256,
      geometry:geometry.sha256,textures:textures?.sha256??null},
    worldDefinitionDigest:sequence.worldDefinitionDigest,
    durationSec:sequence.durationSec,fps:sequence.fps,frameCount:sequence.frameCount,
    frames:sequence.frames.map(frame=>({
      index:frame.index,timeSec:frame.timeSec,tick:frame.tick,
      sourceVisualFrameDigest:frame.frameDigest,webGpuPlanDigest:frame.renderPlan.digest,
      cameraPosition:frame.cameraPosition,cameraRotationDeg:frame.cameraRotationDeg,
      fovYDeg:frame.fovYDeg,
      file:'frames/'+String(frame.index).padStart(5,'0')+'.json'
    })),
    boundaries:sequence.boundaries,
    releaseState:'render_plans_only_no_pixels_or_publication'
  };
  try{
    fs.mkdirSync(path.join(output,'frames'),{recursive:true,mode:0o700});
    for(const frame of sequence.frames){
      const filename=path.join(output,'frames',String(frame.index).padStart(5,'0')+'.json');
      fs.writeFileSync(filename,JSON.stringify(frame.renderPlan)+'\n',{flag:'wx',mode:0o600});
    }
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  }catch(error){
    fs.rmSync(output,{recursive:true,force:true});
    throw error;
  }
  console.log(JSON.stringify({output,frameCount:sequence.frameCount,
    worldId:sequence.worldId,firstPlanDigest:sequence.frames[0].renderPlan.digest,
    lastPlanDigest:sequence.frames[sequence.frames.length-1].renderPlan.digest,
    renderStatus:'not_rendered',publicationAuthority:false}));
}
try{main(process.argv.slice(2));}
catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
