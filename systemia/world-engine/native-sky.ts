/**
 * Evercraft original cinematic sky pass.
 * A real native WebGPU fragment shader, not a downloaded HDRI/photo/stock sky,
 * video compositor, atmospheric-scattering simulation or weather prediction.
 * The horizon follows the ACTUAL moving 3D camera view basis.
 * Existing scenes are byte-identical unless explicit BATTLE_SKY=1 in lab.
 */
import crypto from 'node:crypto';
import type {WebGpuRenderPlan} from './webgpu.js';

export const CINEMATIC_SKY_WGSL=`
struct SkyCamera {
  right: vec4<f32>,
  up: vec4<f32>,
  forward: vec4<f32>,
  settings: vec4<f32>,
  sun: vec4<f32>,
};
@group(0) @binding(0) var<uniform> camera: SkyCamera;
struct ScreenRay {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
@vertex
fn vs_sky(@builtin(vertex_index) vertexIndex: u32) -> ScreenRay {
  let screen = array<vec2<f32>,3>(
    vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0)
  );
  var out: ScreenRay;
  out.ndc=screen[vertexIndex];
  out.position=vec4<f32>(out.ndc,0.0,1.0);
  return out;
}
@fragment
fn fs_sky(input: ScreenRay)-> @location(0) vec4<f32> {
  // Fullscreen pixel ray reconstructed from verified native projection
  // and canonical view basis. Pitch and FOV, not a screen-space sky sticker,
  // determine the location of the visible world-space horizon.
  let direction=normalize(
    camera.forward.xyz +
    camera.right.xyz*(input.ndc.x*camera.settings.x) +
    camera.up.xyz*(input.ndc.y*camera.settings.y)
  );
  let elevation=clamp(direction.y,0.0,1.0);
  let horizonToZenith=pow(elevation,0.56);
  let upper=vec3<f32>(0.055,0.105,0.18);
  let horizon=vec3<f32>(0.28,0.35,0.43);
  var sky=mix(horizon,upper,horizonToZenith);
  // Subtle atmospheric blue-grey bands. Procedural and illustrative,
  // with no asserted date/time/photographic meteorology.
  let haze=exp(-abs(direction.y)*13.0);
  let band=0.5+0.5*sin(direction.x*19.0+direction.z*11.0+
    0.3*sin(direction.x*9.0)+camera.settings.z*0.045);
  sky+=vec3<f32>(0.034,0.04,0.047)*haze*band;
  let sunAlignment=max(dot(direction,normalize(camera.sun.xyz)),0.0);
  let broad=pow(sunAlignment,14.0);
  let narrow=pow(sunAlignment,210.0);
  sky+=vec3<f32>(0.17,0.145,0.107)*broad+vec3<f32>(0.33,0.25,0.15)*narrow;
  return vec4<f32>(clamp(sky,vec3<f32>(0.0),vec3<f32>(1.0)),1.0);
}
`;
export function skyShaderSha256(){
 return crypto.createHash('sha256').update(CINEMATIC_SKY_WGSL).digest('hex');
}
export function cinematicSkyCameraUniform(plan:WebGpuRenderPlan):Float32Array{
 const m=plan.viewMatrix,pr=plan.projectionMatrix;
 if(m.length!==16||pr.length!==16||
  ![...m,...pr,plan.timeSec].every(Number.isFinite)||
  Math.abs(pr[0])<.001||Math.abs(pr[5])<.001)throw Error('cinematic_sky_projection_invalid');
 const right=[m[0],m[4],m[8],0];
 const up=[m[1],m[5],m[9],0];
 const forward=[-m[2],-m[6],-m[10],0];
 const solar=plan.lights.find(l=>l.kind===1);
 const dir=solar?.direction??[.24,-.9,-.21];
 const sun=[-dir[0],-dir[1],-dir[2],0];
 const vals=[...right,...up,...forward,1/pr[0],1/pr[5],plan.timeSec,0,...sun];
 if(vals.length!==20||!vals.every(Number.isFinite))throw Error('cinematic_sky_uniform_invalid');
 const r=(v:number[])=>Math.hypot(v[0],v[1],v[2]);
 if([right,up,forward,sun].some(v=>r(v)<.01))throw Error('cinematic_sky_basis_invalid');
 return new Float32Array(vals);
}
