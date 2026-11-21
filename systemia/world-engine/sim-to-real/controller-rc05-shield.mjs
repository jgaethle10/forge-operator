/**
 * RC05B experimental observed-geometry brake envelope for RC05A detours.
 * Reads only modeled anonymous proximity scan and noisy pose estimate.
 * No obstacle identity, world truth, map, actuator API or safety certification.
 * This conservative filter cannot guarantee an actual stop under command latency.
 */
import {reactiveCommandProgress} from './controller-rc05-progress.mjs';
import {wrap} from './controller-rc05.mjs';

export const SHIELD_SCHEMA='evercraft.sim-to-real.observation-shield.rc05b';
const length=v=>Math.hypot(v.x,v.z);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const hold=(decision,reason,details)=>({...decision,velocity:{x:0,z:0},reason,
  shield:{schema:SHIELD_SCHEMA,evidence_state:'modeled',permitted:false,...details},authority:'modeled_only'});

function segmentDistance(origin,displacement,point){
  const norm=dot(displacement,displacement);
  const t=norm>0?clamp(dot(point,displacement)/norm,0,1):0;
  return Math.hypot(point.x-displacement.x*t,point.z-displacement.z*t);
}
export function observedDetourRisk({estimate,scan,velocity,candidate,uncertainty=.06,
  delaySeconds=.3,braking=.5,robotRadius=.22,bounds}){
  if(!Array.isArray(scan)||!estimate||!candidate||!velocity||!bounds||
    !Number.isFinite(candidate.x)||!Number.isFinite(candidate.z)||
    !Number.isFinite(velocity.x)||!Number.isFinite(velocity.z)||
    !Number.isFinite(estimate.x)||!Number.isFinite(estimate.z)||!Number.isFinite(estimate.heading)||
    !Number.isFinite(delaySeconds)||delaySeconds<0||!Number.isFinite(braking)||braking<=0||
    !Number.isFinite(uncertainty)||uncertainty<0||!Number.isFinite(robotRadius)||robotRadius<=0)
    throw Error('rc05b_invalid_shield_inputs');
  const requested=length(candidate),current=length(velocity);
  const reaction=delaySeconds+.22;
  const assumedBraking=Math.max(.12,braking*.70);
  const residualDistance=current*reaction+current*current/(2*assumedBraking);
  const candidateDistance=requested*reaction+requested*requested/(2*assumedBraking);
  const lookahead=Math.max(.38,residualDistance,candidateDistance)+.22;
  const directions=[{name:'current',vector:current>.001?
    {x:velocity.x/current*lookahead,z:velocity.z/current*lookahead}:{x:0,z:0}},
    {name:'requested',vector:requested>.001?
    {x:candidate.x/requested*lookahead,z:candidate.z/requested*lookahead}:{x:0,z:0}}];
  const inset=.36+uncertainty;
  for(const {name,vector} of directions){
    const final={x:estimate.x+vector.x,z:estimate.z+vector.z};
    if(final.x<bounds.xmin+inset||final.x>bounds.xmax-inset||
       final.z<bounds.ymin+inset||final.z>bounds.ymax-inset){
      return {safe:false,reason:'shield_geofence_hold',direction:name,lookahead,minimumClearance:null};
    }
  }
  let minimumClearance=Infinity;
  for(const item of scan){
    if(!Number.isFinite(item.range)||item.range<0||!Number.isFinite(item.radius)||item.radius<=0||
       !Number.isFinite(item.bearing))throw Error('rc05b_invalid_sensor_reading');
    const center=item.range+item.radius;
    const heading=wrap(estimate.heading+item.bearing);
    const point={x:center*Math.cos(heading),z:center*Math.sin(heading)};
    const inflated=item.radius+robotRadius+uncertainty+.18+.30*reaction;
    for(const {name,vector} of directions){
      const clearance=segmentDistance({x:0,z:0},vector,point)-inflated;
      minimumClearance=Math.min(minimumClearance,clearance);
      if(clearance<=.08){
        return {safe:false,reason:'shield_observed_hazard_hold',direction:name,
          lookahead,minimumClearance};
      }
    }
  }
  return {safe:true,reason:'shield_permitted',lookahead,minimumClearance:
    Number.isFinite(minimumClearance)?minimumClearance:null};
}

export function reactiveCommandShielded(args){
  const decision=reactiveCommandProgress(args);
  if(decision.reason!=='progress_detour')return decision;
  const speed=length(decision.velocity);
  const maxSpeed=decision.freeDistance<1.5?.30:.44;
  const bounded={x:decision.velocity.x*Math.min(1,maxSpeed/Math.max(speed,1e-9)),
    z:decision.velocity.z*Math.min(1,maxSpeed/Math.max(speed,1e-9))};
  const risk=observedDetourRisk({...args,candidate:bounded});
  if(!risk.safe)return hold(decision,risk.reason,risk);
  return {...decision,velocity:bounded,reason:'shielded_progress',
    shield:{schema:SHIELD_SCHEMA,evidence_state:'modeled',permitted:true,
      ...risk,modelOnly:true,certifiedSafe:false},authority:'modeled_only'};
}