/**
 * RC05A experimental progress-gated escape selection. No hardware authority.
 * Keeps baseline's stale sensor, geofence and uncertain-localization holds.
 * Only intervenes when the baseline selects a heading with ~zero speed.
 */
import {reactiveCommand,freeDistance,wrap} from './controller-rc05.mjs';

const length=v=>Math.hypot(v.x,v.z);
export function reactiveCommandProgress(args){
  const baseline=reactiveCommand(args); // Also validates inputs; owns all fail-closed holds.
  if(baseline.reason!=='reactive_heading'||length(baseline.velocity)>=.10)return baseline;
  const {estimate,goal,bounds,scan,velocity,uncertainty=.06,delaySeconds=.3,
    braking=.5,maxSpeed=.82,robotRadius=.22,state={preferredTurn:0}}=args;
  const target=Math.atan2(goal.z-estimate.z,goal.x-estimate.x);
  const currentSpeed=length(velocity);
  const stopBudget=currentSpeed*(delaySeconds+.1)+currentSpeed*currentSpeed/(2*braking)+.12+uncertainty;
  const inset=.3+uncertainty;
  const candidates=[];
  for(let j=-18;j<=18;j++){
    const offset=j*Math.PI/18,heading=wrap(target+offset);
    const free=freeDistance(heading,estimate,scan,{robotRadius,uncertainty});
    const available=free-currentSpeed*delaySeconds-.25-uncertainty;
    if(available<=.03||free-stopBudget<=.12)continue;
    const speed=Math.min(maxSpeed,.65,Math.sqrt(2*braking*available),Math.max(.12,(free-stopBudget)*.65));
    if(speed<.11)continue;
    const probe=.35;
    const future={x:estimate.x+probe*Math.cos(heading),z:estimate.z+probe*Math.sin(heading)};
    if(future.x<bounds.xmin+inset||future.x>bounds.xmax-inset||
       future.z<bounds.ymin+inset||future.z>bounds.ymax-inset)continue;
    const persistence=(state.preferredTurn&&Math.sign(offset)===state.preferredTurn)? .13:0;
    const score=1.1*Math.cos(offset)+.36*Math.min(3.4,free)-.06*Math.abs(offset)+persistence;
    candidates.push({heading,free,speed,offset,score});
  }
  candidates.sort((a,b)=>b.score-a.score||b.free-a.free||a.offset-b.offset);
  const best=candidates[0];
  if(!best)return { ...baseline,velocity:{x:0,z:0},reason:'progress_no_safe_heading_hold' };
  return {velocity:{x:best.speed*Math.cos(best.heading),z:best.speed*Math.sin(best.heading)},
    reason:'progress_detour',heading:best.heading,freeDistance:best.free,
    stoppingBudget:stopBudget,state:{preferredTurn:Math.abs(best.offset)>.15?Math.sign(best.offset):(state.preferredTurn||0)},
    authority:'modeled_only'};
}
