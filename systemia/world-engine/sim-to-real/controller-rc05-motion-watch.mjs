/**
 * Evercraft RC05D, synthetic moving-hazard watch. Research-only, opt-in.
 * Uses anonymous sensor returns and noisy estimated pose, never ground-truth IDs,
 * world obstacle positions, motors or physical safety authority.
 */
import {reactiveCommandEscape} from './controller-rc05-escape.mjs';

export const MOTION_WATCH_SCHEMA='evercraft.sim-to-real.motion-watch.rc05d';
const norm=v=>Math.hypot(v.x,v.z);
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const pointDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Carry only bounded, anonymous, observed local geometry across ticks. */
export function updateMotionMemory({history=[],scan=[],estimate,tick,dt=.1}={}){
  if(!Array.isArray(history)||!Array.isArray(scan)||!estimate||
    ![estimate.x,estimate.z,estimate.heading,dt].every(valid)||dt<=0||
    !Number.isInteger(tick)||tick<1)throw Error('rc05d_tracker_invalid');
  const points=scan.map((s,index)=>{
    if(![s.range,s.bearing,s.radius].every(valid)||s.range<0||s.radius<=0)
      throw Error('rc05d_scan_invalid');
    const theta=estimate.heading+s.bearing,r=s.range+s.radius;
    return {x:estimate.x+r*Math.cos(theta),z:estimate.z+r*Math.sin(theta),radius:s.radius,index};
  });
  const candidates=history.filter(h=>Number.isInteger(h.tick)&&h.tick<tick&&tick-h.tick>=3&&tick-h.tick<=12);
  const tracks=[];
  for(const p of points){
    let match=null,score=Infinity;
    for(const h of candidates){
      for(const q of h.points){
        if(Math.abs(q.radius-p.radius)>.09)continue;
        const dist=pointDistance(p,q);
        const gap=(tick-h.tick)*dt;
        const maxTravel=.85*gap+.20;
        if(dist>maxTravel)continue;
        // Prefer a well-spaced history snapshot to damp measurement noise.
        const cost=dist+Math.abs(gap-.7)*.06;
        if(cost<score){score=cost;match={q,gap,dist};}
      }
    }
    if(!match)continue;
    const velocity={x:(p.x-match.q.x)/match.gap,z:(p.z-match.q.z)/match.gap};
    const speed=norm(velocity);
    if(speed<.13)continue;
    const cap=speed>.8?.8/speed:1;
    tracks.push({x:p.x,z:p.z,radius:p.radius,vx:velocity.x*cap,vz:velocity.z*cap,
      observedSpeed:Math.min(.8,speed),observationSpanSec:match.gap,matchResidual:match.dist,
      anonymous:true});
  }
  const nextHistory=[...history,{tick,points:points.map(({x,z,radius})=>({x,z,radius}))}]
    .filter(x=>tick-x.tick<=12).slice(-13);
  return {history:nextHistory,tracks};
}

/** Constant-velocity relative-motion warning. Neither a physical prediction
 * nor a certified safe stop. Evaluates queued command delay explicitly.
 */
export function evaluateMovingHazards({estimate,velocity,requested,tracks=[],bounds,
  delaySeconds=.3,robotRadius=.22,uncertainty=.06,horizonSec=2.8}={}){
  if(!estimate||!velocity||!requested||!bounds||!Array.isArray(tracks)||
    ![estimate.x,estimate.z,velocity.x,velocity.z,requested.x,requested.z,
      delaySeconds,robotRadius,uncertainty,horizonSec].every(valid)||
    delaySeconds<0||robotRadius<=0||uncertainty<0||horizonSec<=0||horizonSec>6)
    throw Error('rc05d_watch_invalid');
  let smallest=Infinity,nearest=null;
  for(const track of tracks){
    if(![track.x,track.z,track.vx,track.vz,track.radius].every(valid)||track.radius<=0)
      throw Error('rc05d_track_invalid');
    for(let i=0;i<=Math.ceil(horizonSec/.1);i++){
      const t=Math.min(horizonSec,i*.1),latency=Math.min(t,delaySeconds),follow=Math.max(0,t-delaySeconds);
      // Native command latency is real within the toy simulator. Model rover
      // conservatively as moving at current v until the pipeline can respond.
      const rover={x:estimate.x+velocity.x*latency+requested.x*follow,
        z:estimate.z+velocity.z*latency+requested.z*follow};
      const obstacle={x:track.x+track.vx*t,z:track.z+track.vz*t};
      // Increasing uncertainty on longer prediction; assumes no unmodeled acceleration.
      const envelope=track.radius+robotRadius+uncertainty+.11+.045*t;
      const gap=pointDistance(rover,obstacle)-envelope;
      if(gap<smallest){smallest=gap;nearest={predictedTimeSec:Number(t.toFixed(3)),
        predictedGapMeters:Number(gap.toFixed(5)),trackSpeed:track.observedSpeed??norm({x:track.vx,z:track.vz})};}
    }
  }
  // Research-only warning threshold, not a certified collision policy.
  const danger=smallest<.04;
  return {hazard:danger,nearest,trackedObjects:tracks.length,
    minPredictedGapMeters:Number.isFinite(smallest)?Number(smallest.toFixed(5)):null,
    assumption:'anonymous_constant_velocity_synthetic_only',certifiedSafe:false};
}

export function reactiveCommandMotionWatch(args){
  const original=reactiveCommandEscape(args);
  // Baseline fail-closed hold decisions remain untouched.
  if(norm(original.velocity)<1e-9||original.reason.endsWith('_hold'))return original;
  const audit=evaluateMovingHazards({...args,requested:original.velocity});
  if(!audit.hazard)return {...original,motionWatch:{...audit,intervened:false}};
  return {...original,velocity:{x:0,z:0},reason:'moving_hazard_hold',
    motionWatch:{...audit,intervened:true,productionAuthorized:false,hardwareAuthorized:false},
    authority:'modeled_only'};
}
