/* Evercraft RC05: synthetic, local-only observation + bounded reactive control.
 * The controller receives anonymous surface-distance/bearing detections, never
 * a world obstacle map. It has no actuator access and no safety certification.
 */
export const RC05_CONTROLLER_SCHEMA='evercraft.sim-to-real.controller.rc05';
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function validPose(p){return p&&finite(p.x)&&finite(p.z)&&finite(p.heading);}

/** Independent synthetic proximity instrument, with occlusion and a 3.4m range cap.
 * Uses the environment's truth solely inside the sensor adapter. The returned
 * observation intentionally omits global positions and obstacle IDs.
 */
export function scanAnonymous({pose,obstacles,rng,noise=0,rangeMax=3.4}){
  if(!validPose(pose)||!Array.isArray(obstacles)||typeof rng!=='function'||!finite(noise)||noise<0)throw Error('rc05_scan_invalid');
  const candidates=obstacles.map(o=>{
    if(!finite(o.x)||!finite(o.z)||!finite(o.radius)||o.radius<=0)throw Error('rc05_obstacle_invalid');
    const dx=o.x-pose.x,dz=o.z-pose.z;
    const center=Math.hypot(dx,dz),bearing=wrap(Math.atan2(dz,dx)-pose.heading);
    const angularRadius=Math.asin(clamp(o.radius/Math.max(center,1e-9),0,1));
    return {center,bearing,angularRadius,radius:o.radius};
  }).sort((a,b)=>a.center-b.center);
  const visible=[];
  for(const c of candidates){
    const surface=Math.max(0,c.center-c.radius);
    if(surface>rangeMax)continue;
    // Ray to the center is blocked when a closer disc spans that bearing.
    const occulted=visible.some(near=>Math.abs(wrap(c.bearing-near.bearing))<near.angularRadius);
    if(occulted)continue;
    visible.push(c);
  }
  return visible.map(c=>({
    range:Math.max(0,c.center-c.radius+(rng()-.5)*noise),
    bearing:wrap(c.bearing+(rng()-.5)*noise*.06),radius:c.radius
  })).sort((a,b)=>a.range-b.range);
}

/** Approximate unobstructed travel along heading based only on local returns.
 * Inflates obstacles by robot radius, localization error, and safety margin.
 */
export function freeDistance(heading,estimate,scan,{robotRadius=.22,uncertainty=.06,margin=.14}={}){
  if(!validPose(estimate)||!finite(heading)||!Array.isArray(scan)||!finite(uncertainty)||uncertainty<0)throw Error('rc05_clearance_invalid');
  let available=3.4;
  for(const s of scan){
    if(!finite(s.range)||!finite(s.bearing)||!finite(s.radius)||s.range<0||s.radius<=0)throw Error('rc05_bad_reading');
    const center=s.range+s.radius;
    const angle=wrap(estimate.heading+s.bearing-heading);
    const forward=center*Math.cos(angle),side=Math.abs(center*Math.sin(angle));
    const inflated=s.radius+robotRadius+margin+uncertainty;
    if(forward<=0||side>=inflated)continue;
    available=Math.min(available,Math.max(0,forward-Math.sqrt(inflated*inflated-side*side)));
  }
  return available;
}

/** A deterministic, conservative local heading search. Sensor age and
 * uncertainty fail closed. 'hold' requests are NOT emergency braking and
 * command pipeline delay can still cause motion after a hold.
 */
export function reactiveCommand({estimate,goal,bounds,scan,scanAgeSec,velocity,
    uncertainty=.06,delaySeconds=.3,braking=.5,maxSpeed=.82,robotRadius=.22,
    state={preferredTurn:0}}){
  if(!validPose(estimate)||!goal||!finite(goal.x)||!finite(goal.z)||
     !bounds||!finite(velocity?.x)||!finite(velocity?.z)||
     !finite(scanAgeSec)&&scanAgeSec!==Infinity||!finite(uncertainty)||uncertainty<0||
     !finite(delaySeconds)||delaySeconds<0||!finite(braking)||braking<=0||
     !finite(maxSpeed)||maxSpeed<=0)throw Error('rc05_command_invalid');
  const hold=(reason)=>({velocity:{x:0,z:0},reason,heading:estimate.heading,
    freeDistance:0,stoppingBudget:0,state:{...state},authority:'modeled_only'});
  if(scanAgeSec>.25)return hold('stale_sensor_hold');
  if(uncertainty>.24)return hold('localization_uncertain_hold');
  const inset=.3+uncertainty;
  if(estimate.x<bounds.xmin+inset||estimate.x>bounds.xmax-inset||
     estimate.z<bounds.ymin+inset||estimate.z>bounds.ymax-inset)return hold('geofence_uncertain_hold');
  const gd=Math.hypot(goal.x-estimate.x,goal.z-estimate.z);
  if(gd<.3)return hold('goal_hold');
  const target=Math.atan2(goal.z-estimate.z,goal.x-estimate.x);
  const currentSpeed=Math.hypot(velocity.x,velocity.z);
  const stopBudget=currentSpeed*(delaySeconds+.1)+currentSpeed*currentSpeed/(2*braking)+.12+uncertainty;
  const preference=state.preferredTurn||0;
  const candidates=[];
  for(let j=-12;j<=12;j++){
    const offset=j*Math.PI/18;
    const heading=wrap(target+offset);
    const free=freeDistance(heading,estimate,scan,{robotRadius,uncertainty});
    const safeTravel=Math.max(0,free-stopBudget);
    if(safeTravel<=.04)continue;
    const horizon=.35;
    const future={x:estimate.x+horizon*Math.cos(heading),z:estimate.z+horizon*Math.sin(heading)};
    if(future.x<bounds.xmin+inset||future.x>bounds.xmax-inset||
       future.z<bounds.ymin+inset||future.z>bounds.ymax-inset)continue;
    const progress=Math.cos(offset);
    const clearanceBonus=Math.min(free,2.8)*.11;
    const turnPersistence=preference&&Math.sign(offset)===preference?.08:0;
    const score=progress*1.45+clearanceBonus+turnPersistence-Math.abs(offset)*.15;
    candidates.push({heading,offset,free,safeTravel,score});
  }
  candidates.sort((a,b)=>b.score-a.score||b.free-a.free||a.offset-b.offset);
  if(!candidates.length)return {...hold('hazard_hold'),stoppingBudget:stopBudget};
  const best=candidates[0];
  const envelope=Math.sqrt(2*braking*Math.max(0,best.free-currentSpeed*delaySeconds-.25-uncertainty));
  const speed=Math.min(maxSpeed,envelope,Math.max(.15,best.safeTravel*.85));
  const newTurn=Math.abs(best.offset)>.15?Math.sign(best.offset):preference;
  return {velocity:{x:speed*Math.cos(best.heading),z:speed*Math.sin(best.heading)},
    reason:'reactive_heading',heading:best.heading,freeDistance:best.free,
    stoppingBudget:stopBudget,state:{preferredTurn:newTurn},authority:'modeled_only'};
}
