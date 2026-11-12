/** RC05C research-only lateral escape around a synthetic observed obstacle.
 * No world truth, no device commands, no assurance that latency/occlusion is safe.
 * Does not supersede the verified baseline controller.
 */
import {reactiveCommandProgress} from './controller-rc05-progress.mjs';
import {wrap} from './controller-rc05.mjs';

export const ESCAPE_SCHEMA='evercraft.sim-to-real.observed-lateral-escape.rc05c';
const length=v=>Math.hypot(v.x,v.z);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function pathMinimumClearance(displacement,center,inflated){
  const d2=displacement.x*displacement.x+displacement.z*displacement.z;
  const k=d2>1e-12?clamp((center.x*displacement.x+center.z*displacement.z)/d2,0,1):0;
  return Math.hypot(center.x-k*displacement.x,center.z-k*displacement.z)-inflated;
}

/** Tests current inertia and proposed low-speed maneuver separately against
 * anonymous noisy detections. Prediction is a conservative planar approximation.
 */
export function evaluateEscapeEnvelope(args,candidate){
  const {estimate,scan,velocity,bounds,uncertainty=.06,delaySeconds=.3,
    braking=.5,robotRadius=.22}=args;
  if(!estimate||!Array.isArray(scan)||!velocity||!candidate||!bounds||
     ![estimate.x,estimate.z,estimate.heading,velocity.x,velocity.z,candidate.x,candidate.z,
       uncertainty,delaySeconds,braking,robotRadius].every(Number.isFinite)||
     uncertainty<0||delaySeconds<0||braking<=0||robotRadius<=0)throw Error('rc05c_invalid_envelope');
  const currentSpeed=length(velocity),requestSpeed=length(candidate);
  const brake=Math.max(.12,.7*braking);
  const residual=currentSpeed*(delaySeconds+.12)+currentSpeed**2/(2*brake)+.07;
  const requested=requestSpeed*(delaySeconds+.12)+requestSpeed**2/(2*brake)+.07;
  const vectors=[{name:'inertia',x:currentSpeed>1e-5?velocity.x/currentSpeed*residual:0,
    z:currentSpeed>1e-5?velocity.z/currentSpeed*residual:0},
    {name:'detour',x:requestSpeed>1e-5?candidate.x/requestSpeed*requested:0,
    z:requestSpeed>1e-5?candidate.z/requestSpeed*requested:0}];
  const inset=.32+uncertainty;
  for(const v of vectors){
    const x=estimate.x+v.x,z=estimate.z+v.z;
    if(x<bounds.xmin+inset||x>bounds.xmax-inset||z<bounds.ymin+inset||z>bounds.ymax-inset)
      return {allowed:false,reason:'escape_geofence_hold',direction:v.name,minClearance:null};
  }
  let minClearance=Infinity;
  for(const reading of scan){
    if(![reading.range,reading.bearing,reading.radius].every(Number.isFinite)||
      reading.range<0||reading.radius<=0)throw Error('rc05c_invalid_reading');
    const centerDist=reading.range+reading.radius;
    const theta=wrap(estimate.heading+reading.bearing);
    const c={x:centerDist*Math.cos(theta),z:centerDist*Math.sin(theta)};
    // Motion uncertainty allowance, not a known guarantee of a moving object's trajectory.
    const inflated=reading.radius+robotRadius+uncertainty+.08+.15*delaySeconds;
    for(const v of vectors){
      const clr=pathMinimumClearance(v,c,inflated);
      minClearance=Math.min(minClearance,clr);
      if(clr<.065)return {allowed:false,reason:'escape_observed_hazard_hold',
        direction:v.name,minClearance:clr};
    }
  }
  return {allowed:true,reason:'escape_geometry_clear',
    minClearance:Number.isFinite(minClearance)?minClearance:null};
}

/** Only enters when RC05A reports its stalled-heading detour request.
 * Preserves all baseline stale/uncertain/geofence/hazard holds unchanged.
 */
export function reactiveCommandEscape(args){
  const original=reactiveCommandProgress(args);
  if(original.reason!=='progress_detour')return original;
  const {estimate,goal,maxSpeed=.82,state={preferredTurn:0}}=args;
  const target=Math.atan2(goal.z-estimate.z,goal.x-estimate.x);
  const first=state.preferredTurn||0;
  const options=[];
  for(let j=-15;j<=15;j++){
    const offset=j*Math.PI/18;
    const heading=wrap(target+offset);
    for(const proposed of [.36,.28,.20,.14]){
      const speed=Math.min(maxSpeed,proposed);
      const candidate={x:speed*Math.cos(heading),z:speed*Math.sin(heading)};
      const risk=evaluateEscapeEnvelope(args,candidate);
      if(!risk.allowed)continue;
      const turnBias=first!==0&&Math.sign(offset)===first?.12:0;
      const score=Math.cos(offset)*1.25+speed*.30+Math.min(1,risk.minClearance??1)*.09+turnBias-
        Math.abs(offset)*.055;
      options.push({offset,heading,speed,candidate,risk,score});
    }
  }
  options.sort((a,b)=>b.score-a.score||b.speed-a.speed||a.offset-b.offset);
  const selected=options[0];
  if(!selected)return {...original,velocity:{x:0,z:0},reason:'escape_no_observed_clearance_hold',
    escape:{schema:ESCAPE_SCHEMA,permitted:false,certifiedSafe:false}};
  return {...original,velocity:selected.candidate,reason:'observed_lateral_escape',heading:selected.heading,
    state:{preferredTurn:Math.abs(selected.offset)>.1?Math.sign(selected.offset):first},
    escape:{schema:ESCAPE_SCHEMA,permitted:true,certifiedSafe:false,
      predictedMinimumClearance:selected.risk.minClearance,requestedSpeed:selected.speed,
      offsetRadians:selected.offset,hardwareAuthority:false}};
}