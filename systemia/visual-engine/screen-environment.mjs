// Evercraft Visual Engine: deterministic cinematic *screen-space* sky + ocean.
// A reusable environment pass for native WebGPU raster pipelines.
// This is an art-directed preview, NOT volumetric clouds, ray-traced water,
// atmospheric scattering simulation, or physically verified reflections.
// All input/fragment uniforms are explicit; no external textures or network.
import crypto from 'node:crypto';

const checksum=v=>'sha256:'+crypto.createHash('sha256').update(v).digest('hex');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const strict=(p,n)=>{if(!p)throw new Error('evercraft_environment_'+n)};
export const ENVIRONMENT_SCHEMA='evercraft.visual-engine.screen-environment.v1';
export const SCREEN_ENVIRONMENT_WGSL=String.raw`
struct SkyUniforms {
  sizeAndHorizon: vec4<f32>,
  skyZenith: vec4<f32>,
  skyHorizon: vec4<f32>,
  oceanDeep: vec4<f32>,
  oceanSurface: vec4<f32>,
  sunColor: vec4<f32>,
  sunMeta: vec4<f32>,
};
@group(0) @binding(0) var<uniform> env: SkyUniforms;
struct SkyOut { @builtin(position) clipPosition: vec4<f32> };
@vertex
fn vs_environment(@builtin(vertex_index) v: u32) -> SkyOut {
  var out: SkyOut;
  var p=vec2<f32>(0.0);
  if (v==0u){p=vec2<f32>(-1.0,-1.0);}
  if (v==1u){p=vec2<f32>(3.0,-1.0);}
  if (v==2u){p=vec2<f32>(-1.0,3.0);}
  out.clipPosition=vec4<f32>(p,0.99,1.0);
  return out;
}
fn saturate(x:f32)->f32 {return clamp(x,0.0,1.0);}
fn hash2(p:vec2<f32>)->f32{
  return fract(sin(dot(p,vec2<f32>(127.1,311.7)))*43758.5453123);
}
fn noise(p:vec2<f32>)->f32{
  let b=floor(p);
  let f=fract(p);
  let k=f*f*(3.0-2.0*f);
  return mix(mix(hash2(b),hash2(b+vec2<f32>(1.0,0.0)),k.x),
    mix(hash2(b+vec2<f32>(0.0,1.0)),hash2(b+vec2<f32>(1.0,1.0)),k.x),k.y);
}
@fragment
fn fs_environment(@builtin(position) pixel:vec4<f32>)->@location(0) vec4<f32>{
  let wh=max(env.sizeAndHorizon.xy,vec2<f32>(1.0));
  let uv=pixel.xy/wh;
  let aspect=wh.x/wh.y;
  let horizon=env.sizeAndHorizon.z;
  let time=env.sizeAndHorizon.w;
  let horizonCurve=smoothstep(0.0,horizon,uv.y);
  var col=mix(env.skyZenith.rgb,env.skyHorizon.rgb,pow(horizonCurve,1.55));
  // Warm horizontal aerial-perspective band and diffuse solar scattering.
  let horizonFog=exp(-pow((uv.y-horizon)/0.065,2.0));
  col=mix(col,env.skyHorizon.rgb*1.05,saturate(horizonFog*.24));
  let sunPixel=vec2<f32>(env.sunMeta.x,env.sunMeta.y);
  let radial=length((uv-sunPixel)*vec2<f32>(aspect,1.0));
  let disk=1.0-smoothstep(env.sunColor.w*.65,env.sunColor.w*1.25,radial);
  let halo=exp(-radial*9.5);
  col+=env.sunColor.rgb*(halo*env.sunMeta.z*.25+disk*env.sunMeta.z*.55);
  // Lightweight translucent cloud bands, no geometric or volumetric claim.
  let cloudField=noise(vec2<f32>(uv.x*10.0+time*.012,uv.y*31.0));
  let cloudDetail=noise(vec2<f32>(uv.x*27.0-time*.019,uv.y*83.0));
  let cloudShape=smoothstep(.60,.75,cloudField*.78+cloudDetail*.22);
  let cloudMask=smoothstep(.08,.2,uv.y)*
    (1.0-smoothstep(horizon*.64,horizon*.94,uv.y));
  let cloud=saturate(cloudShape*cloudMask*env.sunMeta.w);
  col=mix(col,vec3<f32>(.89,.91,.93),cloud*.65);
  if (uv.y>horizon) {
    let seaDepth=saturate((uv.y-horizon)/(1.0-horizon));
    // Sky-colored grazing reflection, moving harmonics, gentle sun streak.
    let rippleA=sin(uv.x*155.0 +time*1.4+sin(uv.y*102.0+time*.6)*2.2);
    let rippleB=sin(uv.x*376.0 -time*2.4+uv.y*415.0);
    let rippleC=sin(uv.y*264.0+uv.x*75.0-time*.8);
    let wave=(rippleA*.49+rippleB*.33+rippleC*.18);
    let waveEnergy=saturate(.5+.5*wave);
    let depthTint=mix(env.oceanSurface.rgb,env.oceanDeep.rgb,
      pow(seaDepth,.58));
    let surfaceShift=(waveEnergy-.5)*(0.035+seaDepth*.075);
    col=depthTint+vec3<f32>(surfaceShift,surfaceShift*.9,surfaceShift*.7);
    let width=.018+seaDepth*.28;
    let glint=exp(-pow((uv.x-env.sunMeta.x)/width,2.0));
    let shine=pow(max(.0,waveEnergy),7.0)*glint*
      (1.0-seaDepth*.55)*env.sunMeta.z;
    col+=env.sunColor.rgb*shine*.65;
    let edgeHaze=exp(-seaDepth*38.0);
    col=mix(col,env.skyHorizon.rgb,edgeHaze*.38);
  }
  // Background alpha is deliberately zero: native readback can isolate
  // true authored-object pixels from the screen-space color background.
  return vec4<f32>(clamp(col,vec3<f32>(0.0),vec3<f32>(1.0)),0.0);
}
`;
export const ENVIRONMENT_PRESETS=Object.freeze({
  clear_coastal_day:{
    horizonY:.63,timeSec:0,skyZenith:[.105,.245,.47],
    skyHorizon:[.69,.81,.86],oceanDeep:[.025,.17,.25],
    oceanSurface:[.20,.40,.49],sunColor:[1,.88,.70],
    sunX:.76,sunY:.26,sunStrength:.83,
    sunRadius:.017,cloudAmount:.48
  },
  golden_coast:{
    horizonY:.62,timeSec:0,skyZenith:[.15,.24,.43],
    skyHorizon:[.98,.66,.44],oceanDeep:[.06,.15,.24],
    oceanSurface:[.36,.38,.38],sunColor:[1,.74,.42],
    sunX:.71,sunY:.36,sunStrength:1.2,
    sunRadius:.025,cloudAmount:.58
  }
});
const colors=['skyZenith','skyHorizon','oceanDeep','oceanSurface','sunColor'];
export function compileScreenEnvironment(input={},width=1280,height=720){
  strict(Number.isInteger(width)&&width>=64&&width<=8192,'width_invalid');
  strict(Number.isInteger(height)&&height>=64&&height<=8192,'height_invalid');
  strict(input&&typeof input==='object'&&!Array.isArray(input),'input_invalid');
  const fallback=ENVIRONMENT_PRESETS.clear_coastal_day;
  const args={...fallback,...input};
  for(const name of colors){
    strict(Array.isArray(args[name])&&args[name].length===3&&
      args[name].every(x=>finite(x)&&x>=0&&x<=1),name+'_invalid');
  }
  for(const name of ['horizonY','sunX','sunY','cloudAmount']){
    strict(finite(args[name])&&args[name]>=0&&args[name]<=1,name+'_invalid');
  }
  strict(args.horizonY>=.3&&args.horizonY<=.85,'horizon_out_of_bounds');
  strict(finite(args.timeSec)&&args.timeSec>=0&&args.timeSec<=1e6,'time_invalid');
  strict(finite(args.sunStrength)&&args.sunStrength>=0&&args.sunStrength<=4,'sun_strength_invalid');
  strict(finite(args.sunRadius)&&args.sunRadius>=.003&&args.sunRadius<=.1,'sun_radius_invalid');
  const uniformData=[
    width,height,args.horizonY,args.timeSec,
    ...args.skyZenith,0,...args.skyHorizon,0,
    ...args.oceanDeep,0,...args.oceanSurface,0,
    ...args.sunColor,args.sunRadius,
    args.sunX,args.sunY,args.sunStrength,args.cloudAmount
  ];
  strict(uniformData.length===28&&uniformData.every(finite),'uniform_length_invalid');
  const core={schema:ENVIRONMENT_SCHEMA,width,height,
    preset:{...args},uniformData,
    shaderSha256:checksum(SCREEN_ENVIRONMENT_WGSL),
    limitations:[
      'screen_space_preview_not_3d_water',
      'nonvolumetric_procedural_cloud_layers',
      'no_physically_verified_scattering_or_reflections',
      'background_alpha_reserved_for_object_occupancy_mask'
    ]
  };
  return {...core,digest:checksum(JSON.stringify(core))};
}
export function verifyScreenEnvironment(value){
  try{
    const rebuilt=compileScreenEnvironment(value.preset,value.width,value.height);
    return rebuilt.digest===value.digest&&
      JSON.stringify(rebuilt.uniformData)===JSON.stringify(value.uniformData);
  }catch{return false;}
}
