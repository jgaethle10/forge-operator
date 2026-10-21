/**
 * Illustrative Denmark Strait engine demo using ORIGINAL reusable FX emitters.
 * All motion, wakes, wind, spray, exhaust timing are cinematographic staging.
 * Not measured 1941 sea state, vessel speed, relative track, damage or CFD.
 */
import type {CinematicFxRig,CinematicFxEmitter} from './cinematic-environment-fx.js';
import {VESSELS} from './battle-vessel-silhouettes.js';
export function makeBattleEnvironmentFx():CinematicFxRig{
 const emitters:CinematicFxEmitter[]=[];
 for(const [index,v] of VESSELS.entries()){
  const len=v.length*v.scale;
  emitters.push({
   id:v.id+'-wake',actorId:v.id,kind:'wake',
   anchorLocal:{x:0,y:-.25,z:-len*.50},
   count:12,intervalSec:.33,lifetimeSec:3.55,
   radius:v.beam*v.scale*.64,
   driftLocal:{x:0,y:0,z:-2.5},phase:index*.17
  });
  emitters.push({
   id:v.id+'-bow-spray',actorId:v.id,kind:'spray',
   anchorLocal:{x:v.beam*v.scale*.52,y:.32,z:len*.43},
   count:7,intervalSec:.24,lifetimeSec:1.36,
   radius:.5,
   driftLocal:{x:0,y:.19,z:-1.2},phase:(index*.17+.13)%1
  });
  emitters.push({
   id:v.id+'-exhaust',actorId:v.id,kind:'smoke',
   anchorLocal:{x:0,y:8.35*v.scale,z:-7.9*v.scale},
   count:7,intervalSec:.33,lifetimeSec:2.05,
   radius:.62,
   driftLocal:{x:-.24,y:1.28,z:-.65},phase:(index*.13+.18)%1
  });
 }
 return {schema:'evercraft.world-engine.cinematic-fx-rig.v1',
  id:'original-moving-ship-wake-spray-exhaust-demo',
  durationSec:4,emitters,publicationAuthority:false};
}
