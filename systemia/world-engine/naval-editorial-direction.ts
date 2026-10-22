/**
 * Original World Engine camera direction and editorial look profiles.
 * Entirely optional: no baseline alteration, no 2D crops or stock footage.
 * The native WebGPU scene camera follows the ACTUAL moving 3D entity.
 * Art-directed demonstrator shots, not historical camera placements.
 */
import type {WorldDefinition} from './engine.js';
import {validateWorldDefinition} from './engine.js';
import type {CinematicCameraTake} from './cinematic-rig.js';
export type NavalEditorialShot='waterline_tracking'|'compressed_formation';
export function makeNavalEditorialTake(shot:NavalEditorialShot):CinematicCameraTake{
 if(shot==='waterline_tracking')return {
  schema:'evercraft.world-engine.cinematic-camera-take.v1',
  id:'evercraft-waterline-steel-low-angle-opt-in-not-history',
  cameraEntityId:'cinema-camera',targetEntityId:'bismarck-ship-hull',
  durationSec:4,fps:24,move:'orbit',ease:'smootherstep',
  orbit:{radius:45,startAngleDeg:145,endAngleDeg:135,startHeight:6.3,endHeight:5.6},
  lookAtOffset:{x:0,y:3.75,z:0},startFovYDeg:43,endFovYDeg:42
 };
 if(shot==='compressed_formation')return {
  schema:'evercraft.world-engine.cinematic-camera-take.v1',
  id:'evercraft-telephoto-formation-compression-opt-in-not-history',
  cameraEntityId:'cinema-camera',targetEntityId:'hood-ship-hull',
  durationSec:4,fps:24,move:'orbit',ease:'smoothstep',
  orbit:{radius:97,startAngleDeg:-58,endAngleDeg:-50,startHeight:17,endHeight:15},
  lookAtOffset:{x:8,y:4,z:2},startFovYDeg:28,endFovYDeg:27
 };
 throw Error('naval_editorial_shot_invalid');
}
export function applyNavalEditorialGrade(original:WorldDefinition,shot:NavalEditorialShot):WorldDefinition{
 makeNavalEditorialTake(shot);
 const world=structuredClone(original);
 const scene=world.visualScene;
 if(!scene)throw Error('naval_editorial_missing_visual_scene');
 if(!world.entities.some(e=>e.id==='bismarck-ship-hull'))throw Error('naval_editorial_missing_vessel');
 // Less toy-like gunmetal. Diffuse broad source sunlight, mild contrasting
 // haze, physically motivated PBR parameters but no measured calibration.
 for(const m of scene.materials){
  if(/^battle-.*-hull$/.test(m.id)){
   m.baseColor={r:m.baseColor.r*1.04,g:m.baseColor.g*1.05,
    b:m.baseColor.b*1.06,a:1};
   m.roughness=.67;m.metallic=.30;
  }
  if(m.id==='steel'){m.roughness=.64;m.metallic=.26;}
  if(m.id==='barrel'||m.id==='turret'){m.roughness=.54;m.metallic=.24;}
 }
 const ambient=world.entities.find(e=>e.id==='ambient');
 const sun=world.entities.find(e=>e.id==='sun');
 if(!ambient?.light||!sun?.light)throw Error('naval_editorial_missing_lights');
 ambient.light.intensity=1.49;
 ambient.light.color={r:.36,g:.49,b:.64};
 sun.light.intensity=3.65;
 sun.light.color={r:.83,g:.87,b:.91};
 sun.transform.rotationDeg={x:-47,y:-48,z:0};
 scene.colorManagement={toneMapper:'aces_filmic',exposureBiasStops:-.25};
 scene.atmosphere={
  color:{r:.23,g:.31,b:.39},
  density:.006,startDistance:38,heightFalloff:.011,referenceHeight:0
 };
 world.metadata={...(world.metadata||{}),
  navalEditorialLook:'source_owned_low_angle_optical_blocking_original_material_light_rig',
  navalEditorialShot:shot,
  cameraVisualPerformanceMeasured:false,
  historicallyAuthenticatedLighting:false,
  historicallyAuthenticatedCamera:false,
  publicationAuthority:false};
 validateWorldDefinition(world);
 return world;
}
