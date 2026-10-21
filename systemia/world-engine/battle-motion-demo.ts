/** An optional four-vessel choreography demonstration.
 * Fictional initial courses, no sampled 1941 tracks or actual speeds.
 * Used to exercise generic World Engine actor motion, NOT historical evidence.
 */
import type {WorldDefinition} from './engine.js';
import type {ActorMotionRig,ActorTrack} from './cinematic-actor-motion.js';
import {VESSELS} from './battle-vessel-silhouettes.js';
export function makeBattleMotionDemo(world:WorldDefinition):ActorMotionRig{
 const changes=[
  {id:'hood',x:0.5,z:2.4,heading:1.7,phase:0},
  {id:'prince-of-wales',x:1.1,z:2.8,heading:1.3,phase:.7},
  {id:'bismarck',x:-1.1,z:-2.6,heading:-1.8,phase:1.2},
  {id:'prinz-eugen',x:-.8,z:-3.1,heading:-2.1,phase:2.0}
 ];
 const tracks:ActorTrack[]=changes.map(change=>{
  const ship=VESSELS.find(v=>v.id===change.id);
  if(!ship)throw Error('missing_battle_ship_'+change.id);
  const entityIds=world.entities.filter(e=>e.id.startsWith(ship.id+'-')&&e.renderable).map(e=>e.id);
  if(entityIds.length<15)throw Error('battle_vessel_not_assembled_'+ship.id);
  return {id:ship.id,entityIds,pivot:ship.origin,
   keyframes:[
    {timeSec:0,displacement:{x:0,y:0,z:0},headingDeg:0},
    {timeSec:2,displacement:{x:change.x*.45,y:0,z:change.z*.47},headingDeg:change.heading*.45},
    {timeSec:4,displacement:{x:change.x,y:0,z:change.z},headingDeg:change.heading}
   ],
   heave:{amplitude:.12,frequencyHz:.31,phaseRad:change.phase},
   roll:{amplitudeDeg:.7,frequencyHz:.22,phaseRad:change.phase}
  };
 });
 return {schema:'evercraft.world-engine.actor-motion-rig.v1',
  id:'denmark-strait-four-actor-motion-illustrative',
  durationSec:4,tracks,publicationAuthority:false};
}
