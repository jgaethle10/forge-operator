/**
 * Four independent naval actors in the OWNED World Engine scene graph.
 * This is a procedural geometry / actor-placement stress test, not a factual
 * reenactment of the ships' actual shapes, headings, distances or maneuvers.
 */
import {validateWorldDefinition,type WorldDefinition,type WorldEntity} from './engine.js';
import type {CinematicCameraTake} from './cinematic-rig.js';
import {battleshipWorld} from './battleship-scene.js';

type Position={x:number;y:number;z:number};
type ProxyActor={id:string;name:string;side:'british'|'german';center:Position;headingDeg:number;scale:number;materialId:string};
export const DENMARK_STRAIT_PROXY_ACTORS:ReadonlyArray<ProxyActor>=[
 {id:'hood-proxy',name:'HMS Hood (proxy)',side:'british',center:{x:0,y:0,z:0},headingDeg:0,scale:1,materialId:'hull'},
 {id:'prince-of-wales-proxy',name:'HMS Prince of Wales (proxy)',side:'british',center:{x:-23,y:0,z:-18},headingDeg:8,scale:.89,materialId:'hull_british_proxy'},
 {id:'bismarck-proxy',name:'Bismarck (proxy)',side:'german',center:{x:28,y:0,z:12},headingDeg:172,scale:1,materialId:'hull_german_proxy'},
 {id:'prinz-eugen-proxy',name:'Prinz Eugen (proxy)',side:'german',center:{x:46,y:0,z:32},headingDeg:169,scale:.74,materialId:'hull_cruiser_proxy'}
] as const;
function transformPosition(local:Position, actor:ProxyActor):Position{
 const theta=actor.headingDeg*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
 const x=local.x*actor.scale,z=local.z*actor.scale;
 return {x:actor.center.x+x*c+z*s,y:actor.center.y+local.y*actor.scale,z:actor.center.z-x*s+z*c};
}
export function fourVesselProxyWorld():WorldDefinition{
 const base=structuredClone(battleshipWorld());
 const baseParts=base.entities.filter(e=>e.renderable&&e.id!=='ocean'&&!e.id.startsWith('wake-'));
 if(!baseParts.some(e=>e.id==='ship-hull'))throw Error('historical_proxy_base_hull_missing');
 const world=base as WorldDefinition;
 world.id='world:denmark-strait-four-vessel-proxy-not-authentic';
 world.metadata={
  event:'Battle of the Denmark Strait',eventDate:'1941-05-24',
  sourceState:'original_procedural_four_vessel_illustrative_scene',
  accuracy:'generic ship geometry only; positions/headings/sizes NOT verified against battle records',
  detailedVesselModelsVerified:false,realHistoricalTracksUsed:false,
  projectilePhysicsVerified:false,explosionReconstructed:false,
  publicReleaseAllowed:false,
  primaryResearch:['https://www.royalnavy.mod.uk/news/2021/may/24/20210524-loss-hood',
    'https://www.hmshood.org.uk/history/timeline4.htm']
 };
 const material=world.visualScene?.materials?.find(m=>m.id==='hull');
 if(!material||!world.visualScene)throw Error('historical_proxy_material_missing');
 world.visualScene.materials.push(
  {...structuredClone(material),id:'hull_british_proxy',baseColor:{r:.21,g:.31,b:.38,a:1}},
  {...structuredClone(material),id:'hull_german_proxy',baseColor:{r:.31,g:.32,b:.34,a:1}},
  {...structuredClone(material),id:'hull_cruiser_proxy',baseColor:{r:.34,g:.37,b:.39,a:1}}
 );
 // Keep the canonical source vessel at origin so old shot-geometry contract
 // remains grounded. All other ships are genuine independently located meshes.
 for(const actor of DENMARK_STRAIT_PROXY_ACTORS.slice(1)){
  for(const part of baseParts){
   const e:WorldEntity=structuredClone(part);
   e.id=actor.id+'-'+part.id;
   e.name=actor.name+' '+part.id;
   e.transform.position=transformPosition(part.transform.position,actor);
   e.transform.scale={
    x:(part.transform.scale?.x??1)*actor.scale,
    y:(part.transform.scale?.y??1)*actor.scale,
    z:(part.transform.scale?.z??1)*actor.scale
   };
   e.transform.rotationDeg={x:part.transform.rotationDeg?.x??0,
    y:(part.transform.rotationDeg?.y??0)+actor.headingDeg,
    z:part.transform.rotationDeg?.z??0};
   e.tags=['original_3d_proxy','not_reconstructed_history',actor.side,actor.id];
   if(e.renderable?.materialId==='hull')e.renderable.materialId=actor.materialId;
   world.entities.push(e);
  }
 }
 // The original blue-water ocean is one shared world, not copied per ship.
 // Retain separately lit hulls and native per-object shadow casting.
 world.visualScene.directionalShadows={
  ...world.visualScene.directionalShadows!,
  focus:{x:13,y:2,z:5},
  halfExtent:100,
  resolution:512
 };
 const camera=world.entities.find(e=>e.id==='cinema-camera');
 if(!camera?.camera)throw Error('historical_proxy_camera_missing');
 camera.transform.position={x:-100,y:48,z:95};
 camera.camera.far=650;
 camera.camera.projection={type:'perspective',fovYDeg:54};
 validateWorldDefinition(world);
 return world;
}
export function fourVesselProxyTake():CinematicCameraTake{
 return {schema:'evercraft.world-engine.cinematic-camera-take.v1',
  id:'four-vessel-geometry-not-historical-battle-motion',
  cameraEntityId:'cinema-camera',targetEntityId:'ship-hull',
  durationSec:4,fps:24,move:'orbit',ease:'smootherstep',
  orbit:{radius:105,startAngleDeg:-58,endAngleDeg:-34,startHeight:38,endHeight:30},
  lookAtOffset:{x:11,y:2,z:5},
  startFovYDeg:54,endFovYDeg:52};
}
