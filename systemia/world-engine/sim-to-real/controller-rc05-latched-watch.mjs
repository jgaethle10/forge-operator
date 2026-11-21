/**
 * RC05E: MODELED hazard persistence and cancellation of simulated queued commands.
 * Research-only: does not stop any robot, issue motor commands, or certify braking.
 * Fails closed while a hazard latch is active, including during sensor loss.
 */
import {reactiveCommandMotionWatch,evaluateMovingHazards} from './controller-rc05-motion-watch.mjs';

export const LATCH_SCHEMA='evercraft.sim-to-real.hazard-latch.rc05e';
const magnitude=v=>Math.hypot(v.x,v.z);
const zero=()=>({x:0,z:0});
const validVec=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.z);
export const initialHazardLatch=()=>({active:false,clearStreak:0,ageTicks:0,recoveryTicks:0});

/** Models a control-plane CANCEL that clears software's pending command queue.
 * This is NOT an emergency stop or physical actuator cancellation. Simulation
 * inertia and rate-limited braking remain in the native movement integration.
 */
export function reactiveCommandLatched(args,{latch=initialHazardLatch(),pendingCommands=[]}={}){
  if(!latch||typeof latch.active!=='boolean'||!Number.isInteger(latch.clearStreak)||
    !Number.isInteger(latch.ageTicks)||!Number.isInteger(latch.recoveryTicks)||
    latch.clearStreak<0||latch.ageTicks<0||latch.recoveryTicks<0||
    !Array.isArray(pendingCommands)||!pendingCommands.every(validVec))
    throw Error('rc05e_invalid_latch_state');
  const base=reactiveCommandMotionWatch(args);
  const tracks=args.tracks||[];
  const probe=requested=>evaluateMovingHazards({...args,requested,tracks});
  const knownRisk=base.motionWatch?.hazard===true;
  const pendingRisk=tracks.length>0&&pendingCommands.some(c=>probe(c).hazard);
  const active=latch.active||knownRisk||pendingRisk;
  const fresh=Number.isFinite(args.scanAgeSec)&&args.scanAgeSec<=.10000001&&
    Number.isFinite(args.uncertainty)&&args.uncertainty<=.22;
  const stopRisk=tracks.length>0&&probe(zero()).hazard;
  const nextRisk=tracks.length>0&&probe(base.velocity).hazard;
  const hadThreat=knownRisk||pendingRisk||stopRisk||nextRisk;
  const safetyHold=base.reason.endsWith('_hold')||base.reason==='goal_hold';
  const label=knownRisk?'moving_hazard':pendingRisk?'queued_hazard':
    stopRisk?'inertia_hazard':!fresh?'stale_or_uncertain_scan':
    safetyHold?'original_hold':'awaiting_clearance';
  if(active){
    const stopped=magnitude(args.velocity)<=.09;
    // A single clear/noisy frame cannot immediately authorize motion.
    const clear=fresh&&!hadThreat&&!safetyHold&&stopped;
    const ageTicks=latch.active?latch.ageTicks+1:1;
    const clearStreak=clear?latch.clearStreak+1:0;
    if(clearStreak>=5&&ageTicks>=6){
      const req=magnitude(base.velocity);
      const scale=req>.24?.24/req:1;
      return {
        decision:{...base,velocity:{x:base.velocity.x*scale,z:base.velocity.z*scale},
          reason:'latched_recovery_move',authority:'modeled_only'},
        latch:{active:false,clearStreak:0,ageTicks:0,recoveryTicks:12},
        cancelPending:false,diagnostic:{schema:LATCH_SCHEMA,phase:'release',fresh,
          clearedAfterTicks:ageTicks,realEmergencyStop:false,physicalControl:false}
      };
    }
    return {decision:{...base,velocity:zero(),reason:'latched_hazard_hold',authority:'modeled_only'},
      latch:{active:true,clearStreak,ageTicks,recoveryTicks:0},cancelPending:true,
      diagnostic:{schema:LATCH_SCHEMA,phase:'hold',cause:label,fresh,
        clearStreak,ageTicks,knownRisk,pendingRisk,stopRisk,nextRisk,
        canceledModeledQueue:true,realEmergencyStop:false,physicalControl:false}};
  }
  if(latch.recoveryTicks>0&&!safetyHold){
    const req=magnitude(base.velocity),scale=req>.24?.24/req:1;
    return {decision:{...base,velocity:{x:base.velocity.x*scale,z:base.velocity.z*scale},
      reason:'latched_recovery_move',authority:'modeled_only'},
      latch:{...initialHazardLatch(),recoveryTicks:latch.recoveryTicks-1},
      cancelPending:false,diagnostic:{schema:LATCH_SCHEMA,phase:'recovery',fresh,
        recoveryTicks:latch.recoveryTicks-1,realEmergencyStop:false,physicalControl:false}};
  }
  return {decision:base,latch:initialHazardLatch(),cancelPending:false,
    diagnostic:{schema:LATCH_SCHEMA,phase:'inactive',fresh,
      realEmergencyStop:false,physicalControl:false}};
}