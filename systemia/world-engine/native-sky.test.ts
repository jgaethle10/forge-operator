import test from 'node:test';
import assert from 'node:assert/strict';
import {CINEMATIC_SKY_WGSL,cinematicSkyCameraUniform,skyShaderSha256} from './native-sky.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {battleVesselGeometry,historicSilhouetteWorld,historicSilhouetteTake} from './battle-vessel-silhouettes.js';

test('original source-owned sky is a verifiable native GPU fragment shader with actual world-space rays',()=>{
 assert.match(CINEMATIC_SKY_WGSL,/@vertex\s+fn vs_sky/);
 assert.match(CINEMATIC_SKY_WGSL,/@fragment\s+fn fs_sky/);
 assert.match(CINEMATIC_SKY_WGSL,/camera\.right\.xyz/);
 assert.match(CINEMATIC_SKY_WGSL,/camera\.up\.xyz/);
 assert.match(CINEMATIC_SKY_WGSL,/camera\.forward\.xyz/);
 assert.match(CINEMATIC_SKY_WGSL,/input\.ndc\.x\*camera\.settings\.x/);
 assert.equal(skyShaderSha256().length,64);
 assert.equal(skyShaderSha256(),skyShaderSha256());
 assert.doesNotMatch(CINEMATIC_SKY_WGSL,/textureSample|texture_2d|http[s]?:/);
});
test('sky uniform follows actual camera directions/FOV over 97 signed 3D camera plans',()=>{
 const world=historicSilhouetteWorld(),geo=battleVesselGeometry();
 const sequence=buildCinematicCameraSequence({
  world,take:historicSilhouetteTake('bismarck_hero'),
  geometries:geo,viewport:{width:640,height:360}
 });
 assert.equal(sequence.frameCount,97);
 const frames=[sequence.frames[0],sequence.frames[48],sequence.frames[95]];
 const rows=frames.map(f=>cinematicSkyCameraUniform(f.renderPlan));
 for(const uniforms of rows){
  assert.equal(uniforms.length,20);
  assert.ok([...uniforms].every(Number.isFinite));
  for(const offset of [0,4,8,16]){
   const l=Math.hypot(...Array.from(uniforms.slice(offset,offset+3)));
   assert.ok(l>.6&&l<1.5);
  }
  assert.ok(uniforms[12]>.1&&uniforms[13]>.1);
 }
 assert.notDeepEqual([...rows[0]],[...rows[1]]);
 assert.notDeepEqual([...rows[1]],[...rows[2]]);
 assert.equal(sequence.boundaries.publicationAuthority,false);
 const bad=structuredClone(frames[0].renderPlan);
 bad.projectionMatrix[0]=0;
 assert.throws(()=>cinematicSkyCameraUniform(bad),/cinematic_sky_projection_invalid/);
});
