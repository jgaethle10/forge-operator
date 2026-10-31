import crypto from 'node:crypto';
import { CHALLENGE_SCHEMA, verifyEpisode } from './rover-challenge.mjs';

export const HANDOFF_SCHEMA='evercraft.sim-to-real.world-engine-projection.rc02';
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const vec=(x,z)=>({x,y:0,z});

// Data-only contract adapter. Never invokes the World Engine runtime, sensors, a robot or network.
// Poses are modeled reference trajectories; teleports merely allow visual replay.
export function projectEpisodeToWorldEngine(episode){
  if(!verifyEpisode(episode)||episode.schema!==CHALLENGE_SCHEMA)throw Error('invalid_episode_or_digest');
  if(!Array.isArray(episode.frames)||!episode.frames.length)throw Error('frames_required_for_projection');
  const w=episode.world;
  const entities=[
    {id:'rover',name:'Modeled rover (not hardware)',transform:{position:vec(0,0)},collider:{type:'sphere',radius:w.robotRadius},
      tags:['sim-to-real','modeled','trajectory-playback'],properties:{evidence_state:'modeled',source_episode_sha256:episode.sha256}},
    ...w.obstacles.map(o=>({id:o.id,name:o.id,transform:{position:vec(o.x,o.y)},collider:{type:'sphere',radius:o.radius},
      tags:['obstacle','modeled'],properties:{moving:!!o.moving}}))
  ];
  const definition={schema:'evercraft.world-engine.world.v1',id:`sim-to-real-rc02-${episode.seed}-${episode.policy}`,
    version:1,tickRateHz:10,gravity:{x:0,y:0,z:0},ground:{enabled:false,height:0},entities,
    metadata:{source:'sim-to-real-rover-rc02',evidence_state:'modeled',projection_only:true,
      source_episode_sha256:episode.sha256,hardware_execution:false}};
  const inputs=[];
  for(const frame of episode.frames){
    if(!Number.isInteger(frame.tick)||frame.tick<1||!Number.isFinite(frame.x)||!Number.isFinite(frame.y))throw Error('invalid_frame');
    inputs.push({id:`p-${frame.tick}-rover`,tick:frame.tick,entityId:'rover',kind:'teleport',value:vec(frame.x,frame.y)});
    const moving=frame.obstacles.find(o=>o.id==='moving');
    if(moving)inputs.push({id:`p-${frame.tick}-moving`,tick:frame.tick,entityId:'moving',kind:'teleport',value:vec(moving.x,moving.y)});
  }
  const core={schema:HANDOFF_SCHEMA,evidence_state:'modeled',sourceEpisodeDigest:episode.sha256,
    projectionOnly:true,nativeEngineExecuted:false,physicsProven:false,hardwareExecution:false,world:definition,inputs,
    limitations:['sampled modeled trajectory; unobserved ticks not reconstructed',
      'teleport inputs are visualization playback, not autonomous dynamics or controller execution',
      'native Evercraft World Engine integration and collision validation not yet tested']};
  return {...core,sha256:sha(core)};
}
export function verifyWorldEngineHandoff(receipt){
  if(!receipt||receipt.schema!==HANDOFF_SCHEMA||typeof receipt.sha256!=='string')return false;
  const {sha256,...body}=receipt;
  return sha(body)===sha256;
}