#!/usr/bin/env node
/**
 * Evercraft Studio World Engine -> Photon Forge integration canary.
 * All geometry is authored here; all frame packets are produced by the ACTUAL
 * EvercraftWorldRuntime + compileVisualFrame(). No generated pictures, external
 * render providers, customer data, network calls or publication side effects.
 *
 * This is a synthetic engineering fixture, not a deployed production scene.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  EvercraftWorldRuntime, worldDefinitionDigest, verifyWorldSnapshot,
  type WorldDefinition
} from '../../systemia/world-engine/engine.js';
import {
  compileVisualFrame, verifyVisualFrameContract
} from '../../systemia/world-engine/visual.js';

type Geometry={
  schema:'evercraft.world-engine.geometry.v1';
  id:string;
  primitive:'triangles';
  positions:number[];
  normals:number[];
  indices:number[];
};

type SequenceOptions={
  outputDir:string;frames:number;fps:number;
  worldInput?:WorldDefinition;geometryInput?:Geometry[];
  externalInputSha256?:{world:string;geometry:string};
};

const sha256=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex');
const vector=(x=0,y=0,z=0)=>({x,y,z});
const transform=(x:number,y:number,z:number)=>({
  position:vector(x,y,z),rotationDeg:vector(),scale:vector(1,1,1)
});
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';

function geometry():Geometry{
  // Original double-pyramid mesh (8 triangles), not an imported asset.
  const points=[[0,1.35,0],[1.25,0,0],[0,0,1.25],[-1.25,0,0],[0,0,-1.25],[0,-1.35,0]];
  const faces=[
    [0,1,2],[0,2,3],[0,3,4],[0,4,1],
    [5,2,1],[5,3,2],[5,4,3],[5,1,4]
  ];
  const positions:number[]=[];
  const normals:number[]=[];
  for(const ids of faces){
    const a=points[ids[0]],b=points[ids[1]],c=points[ids[2]];
    const e=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
    const f=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const n=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]];
    const length=Math.hypot(...n);
    for(const id of ids){
      positions.push(...points[id]);
      normals.push(...n.map(v=>v/length));
    }
  }
  return {
    schema:'evercraft.world-engine.geometry.v1',
    id:'evercraft-photon-bridge-octahedron',
    primitive:'triangles',positions,normals,
    indices:Array.from({length:positions.length/3},(_,i)=>i)
  };
}

function worldDefinition(fps:number):WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'evercraft-world-engine-photon-bridge-original-canary',
    version:1,tickRateHz:fps,
    gravity:vector(),ground:{enabled:false,height:0},
    metadata:{canaryOnly:true,customerScene:false,producer:'EvercraftWorldRuntime + compileVisualFrame'},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',
      clearColor:{r:0.004,g:0.008,b:0.023},
      materials:[
        {id:'azure-metal',model:'pbr',baseColor:{r:0.08,g:0.6,b:0.96,a:1},
          metallic:0.7,roughness:0.23,emissive:{r:0.05,g:0.55,b:1},emissiveIntensity:2},
        {id:'violet-metal',model:'pbr',baseColor:{r:0.45,g:0.22,b:0.9,a:1},
          metallic:0.55,roughness:0.18,emissive:{r:0.55,g:0.2,b:1},emissiveIntensity:2},
        {id:'titanium',model:'pbr',baseColor:{r:0.65,g:0.75,b:0.89,a:1},
          metallic:0.85,roughness:0.26}
      ]
    },
    entities:[
      {id:'camera',transform:transform(0,0,9),camera:{
        projection:{type:'perspective',fovYDeg:55},near:.1,far:70,layerMask:1
      }},
      {id:'engine-left',transform:transform(-2.0,0,0),
        renderable:{geometryRef:'evercraft-photon-bridge-octahedron',materialId:'azure-metal',layerMask:1},
        behaviors:[{kind:'spin',degreesPerSecond:vector(0,145,55)}]},
      {id:'engine-center',transform:transform(0,0,-0.6),
        renderable:{geometryRef:'evercraft-photon-bridge-octahedron',materialId:'titanium',layerMask:1},
        behaviors:[{kind:'spin',degreesPerSecond:vector(35,-125,0)}]},
      {id:'engine-right',transform:transform(2.0,0,0),
        renderable:{geometryRef:'evercraft-photon-bridge-octahedron',materialId:'violet-metal',layerMask:1},
        behaviors:[{kind:'spin',degreesPerSecond:vector(0,-145,-55)}]},
      {id:'key',transform:transform(1,4,6),light:{
        type:'point',color:{r:0.28,g:0.7,b:1},intensity:12,range:30,layerMask:1
      }}
    ]
  };
}

export function exportWorldEngineSequence({
  outputDir,frames,fps,worldInput,geometryInput,externalInputSha256
}:SequenceOptions){
  if(!Number.isInteger(fps)||![24,30,60].includes(fps)) throw new Error('worldframe_export_fps_invalid');
  if(!Number.isInteger(frames)||frames<2||frames>120) throw new Error('worldframe_export_frames_invalid');
  if(typeof outputDir!=='string'||!outputDir.trim()) throw new Error('worldframe_export_output_missing');
  const root=path.resolve(outputDir);
  fs.mkdirSync(path.join(root,'frames'),{recursive:true});
  if(Boolean(worldInput)!==Boolean(geometryInput))throw new Error('worldframe_export_world_geometry_pair_required');
  const world=worldInput??worldDefinition(fps);
  const meshes=geometryInput??[geometry()];
  if(world.tickRateHz!==fps)throw new Error('worldframe_export_world_fps_mismatch');
  if(!world.visualScene)throw new Error('worldframe_export_visual_scene_missing');
  if(!Array.isArray(meshes)||!meshes.length||meshes.length>100)throw new Error('worldframe_export_geometry_list_invalid');
  const ids=new Set<string>();
  for(const mesh of meshes){
    if(mesh?.schema!=='evercraft.world-engine.geometry.v1'||mesh.primitive!=='triangles'||
       typeof mesh.id!=='string'||!mesh.id||ids.has(mesh.id)){
      throw new Error('worldframe_export_geometry_schema_invalid');
    }
    ids.add(mesh.id);
    if(!Array.isArray(mesh.positions)||mesh.positions.length<9||mesh.positions.length%3||
       !Array.isArray(mesh.normals)||mesh.normals.length!==mesh.positions.length||
       ![...mesh.positions,...mesh.normals].every(x=>typeof x==='number'&&Number.isFinite(x))){
      throw new Error('worldframe_export_geometry_vertices_invalid');
    }
    const indices=mesh.indices;
    if(!Array.isArray(indices)||indices.length<3||indices.length%3||
       indices.some(x=>!Number.isInteger(x)||x<0||x>=mesh.positions.length/3)){
      throw new Error('worldframe_export_geometry_indices_invalid');
    }
  }
  for(const entity of world.entities||[]){
    if(entity.renderable&&!ids.has(entity.renderable.geometryRef)){
      throw new Error('worldframe_export_geometry_missing:'+entity.renderable.geometryRef);
    }
  }
  const runtime=new EvercraftWorldRuntime(world);
  const names:string[]=[];
  const records:Array<{path:string;digest:string;tick:number;timeSec:number;sha256:string;snapshotDigest:string}>=[];
  for(let index=0;index<frames;index++){
    if(index) runtime.step([]);
    const snapshot=runtime.snapshot();
    if(!verifyWorldSnapshot(snapshot)) throw new Error('worldframe_export_snapshot_invalid');
    if(!runtime.cameraRuntime||!world.visualScene)throw new Error('worldframe_export_camera_unavailable');
    const frame=compileVisualFrame(
      runtime.definition.id,snapshot.tick,snapshot.timeSec,
      world.visualScene,snapshot.entities,runtime.cameraRuntime,runtime.activeEntityIds
    );
    if(!verifyVisualFrameContract(frame))throw new Error('worldframe_export_frame_invalid');
    const name='frames/frame-'+String(index).padStart(3,'0')+'.json';
    const bytes=json(frame);
    fs.writeFileSync(path.join(root,name),bytes,{flag:'w'});
    names.push(name);
    records.push({path:name,digest:frame.digest,tick:frame.tick,timeSec:frame.timeSec,
      sha256:sha256(bytes),snapshotDigest:snapshot.digest});
  }
  const geomBytes=json(meshes);
  fs.writeFileSync(path.join(root,'geometry.json'),geomBytes);
  const authoredWorldBytes=json(world);
  fs.writeFileSync(path.join(root,'world-definition.json'),authoredWorldBytes);
  const manifest={schema:'evercraft.photon-forge-v4.frame-sequence.v1',fps,framePaths:names};
  const manifestBytes=json(manifest);
  fs.writeFileSync(path.join(root,'sequence.json'),manifestBytes);
  const receipt={
    schema:'evercraft.world-engine.photon-frame-producer-receipt.v1',
    status:'original_synthetic_scene_compiled_by_real_engine_in_this_process',
    sceneSource:worldInput?'provided_world_definition_unverified_rights':'original_owned_test_fixture',
    sceneSourceCode:'scripts/photon-forge-v4/export-world-engine-sequence.ts',
    worldId:world.id,worldDefinitionDigest:worldDefinitionDigest(world),
    worldDefinitionFileSha256:sha256(authoredWorldBytes),
    externalInputSha256:externalInputSha256??null,
    sourceRightsVerified:false,
    frameProducer:'EvercraftWorldRuntime + compileVisualFrame',
    engineWasExecutedInThisProcess:true,
    customerFootage:false,externalHardwareVerified:false,
    geometrySha256:sha256(geomBytes),sequenceManifestSha256:sha256(manifestBytes),
    frames:records,framesEncodedByPhotonForge:false,
    originalSoundIncluded:false,masterApproved:false,publicationAuthority:false
  };
  fs.writeFileSync(path.join(root,'producer-receipt.json'),json(receipt));
  return {receipt,manifest};
}

function main(){
  const args=process.argv.slice(2);
  const get=(name:string)=>{
    const i=args.indexOf(name);
    return i>=0?args[i+1]:undefined;
  };
  const outputDir=get('--output-dir');
  const fps=Number(get('--fps')||30);
  const frames=Number(get('--frames')||3);
  if(!outputDir)throw new Error('usage: --output-dir <path> [--fps 30] [--frames 3] [--world-json file --geometry-json file]');
  const scenePath=get('--world-json');
  const geometryPath=get('--geometry-json');
  if(Boolean(scenePath)!==Boolean(geometryPath))throw new Error('worldframe_export_world_geometry_pair_required');
  function load(pathname:string,max:number){
    const bytes=fs.readFileSync(pathname);
    if(bytes.length>max)throw new Error('worldframe_export_input_too_large');
    return {parsed:JSON.parse(bytes.toString('utf8')),digest:sha256(bytes)};
  }
  const source=scenePath?load(scenePath,4*1024*1024):null;
  const geometries=geometryPath?load(geometryPath,8*1024*1024):null;
  const output=exportWorldEngineSequence({
    outputDir,frames,fps,
    worldInput:source?.parsed as WorldDefinition|undefined,
    geometryInput:geometries?.parsed as Geometry[]|undefined,
    externalInputSha256:source&&geometries?{world:source.digest,geometry:geometries.digest}:undefined
  });
  process.stdout.write(json(output.receipt));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main()}catch(error){
    process.stderr.write((error instanceof Error?error.stack:String(error))+'\n');
    process.exitCode=1;
  }
}
