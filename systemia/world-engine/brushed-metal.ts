import {textureAssetDigest,validateTextureAsset,type TextureAsset} from './texture.js';

export interface BrushedMetalSpec {
  idPrefix:string;
  size?:64|128|256;
  grainStrength?:number;
  baseBrightness?:number;
  roughness?:number;
  metallic?:number;
}
export interface BrushedMetalTextures {
  baseColor:TextureAsset;
  orm:TextureAsset;
  normal:TextureAsset;
  digests:{baseColor:string;orm:string;normal:string};
}
function fract(x:number){return x-Math.floor(x)}
function rand(x:number,y:number,channel:number){
  // Deterministic lattice hashing, with no external textures or untrusted assets.
  return fract(Math.sin(x*127.1+y*311.7+channel*74.7)*43758.5453123);
}
function clamp(x:number,min=0,max=1){return Math.min(max,Math.max(min,x))}
function byte(x:number){return Math.round(clamp(x)*255)}
/** Reproducible grayscale steel/ORM/tangent-normal textures, not photographic assets. */
export function makeBrushedMetalTextures(spec:BrushedMetalSpec):BrushedMetalTextures {
  if(!spec || typeof spec.idPrefix!=='string' ||
    !/^[a-z][a-z0-9:/._-]{2,80}$/.test(spec.idPrefix))throw Error('brushed_metal_invalid_id_prefix');
  const size=spec.size??64;
  if(![64,128,256].includes(size))throw Error('brushed_metal_invalid_size');
  const grainStrength=spec.grainStrength??.2;
  const baseBrightness=spec.baseBrightness??.86;
  const roughness=spec.roughness??.36;
  const metallic=spec.metallic??.93;
  for(const [label,x,min,max] of [
    ['grain_strength',grainStrength,0,.5],['base_brightness',baseBrightness,.15,1],
    ['roughness',roughness,.08,.95],['metallic',metallic,.05,1]
  ] as const){
    if(!Number.isFinite(x)||x<min||x>max)throw Error('brushed_metal_invalid_'+label);
  }
  const baseColor:number[]=[],orm:number[]=[],normal:number[]=[];
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const lineNoise=rand(0,y,1)-.5;
      const horizontal=rand(x,y,2)-.5;
      const scratch=rand(x,y,3)>.985?-.18:0;
      const brushed=clamp(baseBrightness+grainStrength*(.67*lineNoise+.33*horizontal)+scratch);
      baseColor.push(byte(brushed),byte(brushed*.985),byte(brushed*.96),255);
      const varyingRoughness=clamp(roughness+.1*lineNoise+.06*horizontal,.08,.95);
      const ao=clamp(.95+scratch*.25,.78,1);
      orm.push(byte(ao),byte(varyingRoughness),byte(metallic),255);
      const tangentBump=grainStrength*.28*(rand(x,y,4)-.5);
      normal.push(byte(.5+tangentBump),byte(.5+grainStrength*.03*lineNoise),
        byte(Math.sqrt(Math.max(0,1-tangentBump*tangentBump))),255);
    }
  }
  const build=(suffix:string,format:TextureAsset['format'],data:number[]):TextureAsset=>({
    schema:'evercraft.world-engine.texture.v1',
    id:spec.idPrefix+'/'+suffix,width:size,height:size,format,data
  });
  const assets={
    baseColor:build('base','rgba8unorm-srgb',baseColor),
    orm:build('orm','rgba8unorm',orm),
    normal:build('normal','rgba8unorm',normal)
  };
  for(const asset of Object.values(assets))validateTextureAsset(asset);
  return {...assets,digests:{
    baseColor:textureAssetDigest(assets.baseColor),
    orm:textureAssetDigest(assets.orm),
    normal:textureAssetDigest(assets.normal)
  }};
}
