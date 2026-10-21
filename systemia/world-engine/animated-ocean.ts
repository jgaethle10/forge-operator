/**
 * Opt-in owned World Engine procedural animated ocean. Source-owned coarse grid,
 * deforming VERTICES in the existing WGSL renderer, with analytic GPU normals.
 * Original static scenes never enter this path.
 *
 * Mathematical repeatable deep-water *stylization*, NOT navier-stokes, CFD,
 * historical sea state, buoyancy or photographed weather.
 */
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
import {validateWorldDefinition,type WorldDefinition} from './engine.js';

export const OCEAN_WAVE_GEOMETRY_ID='owned:evercraft-dynamic-ocean-grid';
export const OCEAN_WAVE_AMPLITUDE=0.80;
const WAVE_COMPONENTS=[
 {a:.43,kx:.21,kz:.12,omega:1.4},
 {a:.38,kx:-.14,kz:.24,omega:-.8},
 {a:.22,kx:.45,kz:.33,omega:2.3}
] as const;

export function sampleAnimatedOceanWave(x:number,z:number,timeSec:number,amplitude=OCEAN_WAVE_AMPLITUDE){
 if(![x,z,timeSec,amplitude].every(Number.isFinite)||Math.abs(x)>10000||Math.abs(z)>10000||
  timeSec<0||timeSec>3600||amplitude<0||amplitude>2)throw Error('animated_ocean_sample_invalid');
 let height=0,dx=0,dz=0;
 for(const c of WAVE_COMPONENTS){
  const phase=c.kx*x+c.kz*z+c.omega*timeSec;
  height+=c.a*Math.sin(phase);
  dx+=c.a*c.kx*Math.cos(phase);
  dz+=c.a*c.kz*Math.cos(phase);
 }
 const nx=-amplitude*dx,nz=-amplitude*dz,mag=Math.hypot(nx,1,nz);
 return {height:amplitude*height,normal:{x:nx/mag,y:1/mag,z:nz/mag}};
}

export function makeAnimatedOceanGrid(subdivisions=112,span=220):GeometryAsset{
 if(!Number.isInteger(subdivisions)||subdivisions<24||subdivisions>180||
   !Number.isFinite(span)||span<80||span>500)throw Error('animated_ocean_grid_budget_invalid');
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
 const corner=(i:number,j:number):[number,number,number]=>
  [(i/subdivisions-.5)*span,-.60,(j/subdivisions-.5)*span];
 const emit=(p:number[],uv:number[])=>{
  positions.push(...p);normals.push(0,1,0);uvs.push(...uv);
 };
 // Triangle winding consistent with original sea: upper face points upward.
 for(let i=0;i<subdivisions;i++)for(let j=0;j<subdivisions;j++){
  const a=corner(i,j),b=corner(i,j+1),c=corner(i+1,j+1),d=corner(i+1,j);
  for(const [p,u] of [
   [a,[0,0]],[b,[0,1]],[c,[1,1]],
   [a,[0,0]],[c,[1,1]],[d,[1,0]]
  ] as Array<[number[],number[]]>)emit(p,u);
 }
 const result:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
  id:OCEAN_WAVE_GEOMETRY_ID,primitive:'triangles',positions,normals,uvs};
 validateGeometryAsset(result);
 return result;
}

export function attachAnimatedOcean(world:WorldDefinition):WorldDefinition{
 const result=structuredClone(world);
 if(!result.visualScene)throw Error('animated_ocean_requires_visual_scene');
 const sea=result.entities.find(e=>e.id==='ocean');
 const water=result.visualScene.materials.find(m=>m.id==='water');
 if(!sea?.renderable||!water||sea.renderable.geometryRef===OCEAN_WAVE_GEOMETRY_ID)
  throw Error('animated_ocean_requires_unmodified_static_sea');
 sea.renderable.geometryRef=OCEAN_WAVE_GEOMETRY_ID;
 sea.transform.scale={x:2,y:1,z:2};
 sea.renderable.castsShadow=false;
 water.roughness=.24;water.metallic=.17;
 water.baseColor={r:.037,g:.099,b:.145,a:1};
 result.metadata={...(result.metadata||{}),
  oceanSurface:'opt_in_original_wgsl_time_deformed_triangles_and_analytic_normals',
  animatedOceanShaderOptIn:true,
  animatedOceanGrid:{subdivisions:112,span:220,waveAmplitude:OCEAN_WAVE_AMPLITUDE},
  animatedOceanSimulationIsCFD:false,
  authenticatedWeather:false,
  publicationAuthority:false};
 validateWorldDefinition(result);
 return result;
}
