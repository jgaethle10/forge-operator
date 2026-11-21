/**
 * RC05G experimental goal-recovery envelope, MODEL-ONLY. Never a geofence
 * override for real hardware or an independent safety system.
 * Consults the already validated RC05E latch decision; can only replace a
 * geofence uncertain hold with a slow *inward* request under narrow conditions.
 */
import {freeDistance} from './controller-rc05.mjs';
import {evaluateMovingHazards} from './controller-rc05-motion-watch.mjs';

export const GOAL_RECOVERY_SCHEMA='evercraft.sim-to-real.goal-inward-recovery.rc05g';
const norm=v=>Math.hypot(v.x,v.z);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const hold=(latched,reason,details={})=>({
  ...latched,
  diagnostic:{...latched.diagnostic,goalRecovery:{schema:GOAL_RECOVERY_SCHEMA,
    permitted:false,reason,realSafetyCertified:false,physicalControl:false,...details}}
});
function insetViolation(p,b,i){
  return Math.max(0,b.xmin+i-p.x,p.x-(b.xmax-i))+
    Math.max(0,b.ymin+i-p.z,p.z-(b.ymax-i));
}
/** This uses only noisy estimated pose, anonymous current scan and observed
 * moving-hazard tracks. Ground truth stays solely in simulation diagnostics.
 */
export function applyGoalInwardRecovery(args,latched,{pendingCommands=[]}={}){
  if(!latched||!latched.decision||!latched.latch||!Array.isArray(pendingCommands))
    throw Error('rc05g_invalid_existing_latch');
  if(latched.decision.reason!=='geofence_uncertain_hold')return latched;
  const {estimate,goal,bounds,velocity,scan,tracks=[],uncertainty,scanAgeSec,
    braking,delaySeconds,robotRadius}=args||{};
  if(!estimate||!goal||!bounds||!velocity||!Array.isArray(scan)||!Array.isArray(tracks)||
    ![estimate.x,estimate.z,estimate.heading,goal.x,goal.z,
      velocity.x,velocity.z,uncertainty,braking,delaySeconds,robotRadius].every(finite)||
      !pendingCommands.every(v=>v&&finite(v.x)&&finite(v.z)))
    throw Error('rc05g_invalid_recovery_inputs');
  if(latched.latch.active||latched.cancelPending)
    return hold(latched,'active_hazard_latch');
  if(!finite(scanAgeSec)||scanAgeSec>.10000001||uncertainty>.11||uncertainty<0)
    return hold(latched,'stale_or_uncertain_localization');
  const dx=goal.x-estimate.x,dz=goal.z-estimate.z,distance=Math.hypot(dx,dz);
  if(distance<=.32||distance>1.35)
    return hold(latched,'not_near_goal', {distance});
  const i=.3+uncertainty, oldViolation=insetViolation(estimate,bounds,i);
  if(oldViolation<.002||oldViolation>.65)
    return hold(latched,'outside_recovery_band',{oldViolation});
  // Do not start a command when the estimated center is outside the real
  // modeled fence or within a thin noisy outer-edge allowance.
  const edge=.006;
  if(estimate.x<=bounds.xmin+edge||estimate.x>=bounds.xmax-edge||
     estimate.z<=bounds.ymin+edge||estimate.z>=bounds.ymax-edge)
    return hold(latched,'outside_modeled_outer_geofence');
  const heading=Math.atan2(dz,dx),unit={x:dx/distance,z:dz/distance};
  const candidate={x:unit.x*.16,z:unit.z*.16};
  const projected={x:estimate.x+unit.x*.18,z:estimate.z+unit.z*.18};
  const newViolation=insetViolation(projected,bounds,i);
  // Near the inner boundary, do not demand a larger improvement than the
  // remaining violation itself; otherwise the robot deadlocks just outside.
  const minimumProgress=Math.min(.07,oldViolation*.5);
  if(newViolation>=oldViolation-minimumProgress)
    return hold(latched,'not_strictly_inward',{oldViolation,newViolation,minimumProgress});
  if(norm(velocity)>.12)
    return hold(latched,'braking_inertia_too_high',{currentSpeed:norm(velocity)});
  const clearance=freeDistance(heading,estimate,scan,{robotRadius,uncertainty,margin:.18});
  if(clearance<.43)
    return hold(latched,'not_enough_observed_clearance',{clearance});
  const risk=evaluateMovingHazards({...args,requested:candidate,tracks});
  if(risk.hazard)
    return hold(latched,'moving_hazard_on_recovery',{clearance});
  if(pendingCommands.some(c=>c.x*unit.x+c.z*unit.z<-.035))
    return {...hold(latched,'flush_outward_simulated_queue'),cancelPending:true};
  return {...latched,
    decision:{...latched.decision,velocity:candidate,
      heading,reason:'goal_inward_recovery',authority:'modeled_only'},
    cancelPending:false,
    diagnostic:{...latched.diagnostic,goalRecovery:{
      schema:GOAL_RECOVERY_SCHEMA,permitted:true,reason:'strict_inward_step',
      oldViolation,newViolation,distance,clearance,requestedSpeed:.16,
      hardwareAuthority:false,realSafetyCertified:false,physicalControl:false}}};
}
