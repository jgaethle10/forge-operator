/**
 * Finger-snap performance gate. Kinematic evidence only, NEVER art approval.
 * Blender source trace MUST contain 120Hz 3D bone-tail coordinates in meters.
 */
export const SNAP_TRACE_SCHEMA='evercraft.animation.snap-trace.v1';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const valid=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dist=(a,b)=>Math.hypot(...sub(a,b));
const relative=(a,origin,b,origin2)=>dist(sub(a,origin),sub(b,origin2));
const held=issues=>({schema:'evercraft.animation.snap-review.v1',status:'HELD',issues,kinematicsVerified:false,creativeApproved:false});
export function evaluateSnapTrace(trace,options={}) {
  if(!trace||trace.schema!==SNAP_TRACE_SCHEMA)return held(['trace_schema_missing']);
  const samples=trace.samples,issues=[];
  const add=x=>{if(!issues.includes(x))issues.push(x)};
  if(!Array.isArray(samples)||samples.length<12)return held(['insufficient_motion_samples']);
  if(!finite(trace.sampleRateHz)||trace.sampleRateHz<60)add('sampling_too_sparse');
  for(let i=0;i<samples.length;i++){
    const s=samples[i];
    if(!finite(s?.timeSec)||(i&&!(s.timeSec>samples[i-1].timeSec)))add('invalid_sample_timing');
    if(!['thumbTip','middleTip','wrist','palm'].every(k=>valid(s?.[k])))add('invalid_or_missing_3d_landmarks');
  }
  if(issues.length)return held(issues);
  const cfg={contactMeters:.018,preGapMeters:.035,releaseMeters:.033,maxReleaseSeconds:.15,
    minRelativeTravelMeters:.021,minRelativeTipVelocity:.23,audioToleranceSec:1/24,...options};
  const gaps=samples.map(s=>dist(s.thumbTip,s.middleTip));
  const contact=gaps.findIndex(d=>d<=cfg.contactMeters);
  if(contact<0)add('no_thumb_middle_contact');
  if(gaps[0]<cfg.preGapMeters)add('finger_prep_gap_missing');
  let release=-1,travel=0,speed=0;
  if(contact>=0){
    const t0=samples[contact].timeSec;
    release=gaps.findIndex((d,i)=>i>contact&&samples[i].timeSec-t0<=cfg.maxReleaseSeconds&&d>=cfg.releaseMeters);
    if(release<0)add('no_fast_finger_release');
  }
  if(contact>=0&&release>=0){
    const p=samples[contact],q=samples[release];
    travel=relative(q.middleTip,q.wrist,p.middleTip,p.wrist);
    if(travel<cfg.minRelativeTravelMeters)add('arm_wave_without_finger_flick');
    for(let i=contact+1;i<=release;i++){
      const a=samples[i-1],b=samples[i];
      speed=Math.max(speed,relative(b.middleTip,b.wrist,a.middleTip,a.wrist)/(b.timeSec-a.timeSec));
    }
    if(speed<cfg.minRelativeTipVelocity)add('finger_release_too_slow');
  }
  const sound=trace.audio?.snapTimeSec;
  if(!finite(sound))add('snap_audio_event_missing');
  if(release>=0&&finite(sound)&&Math.abs(sound-samples[release].timeSec)>cfg.audioToleranceSec)add('finger_sound_sync_off');
  if(samples.at(-1).timeSec-samples[0].timeSec<.18)add('trace_window_too_short');
  return {schema:'evercraft.animation.snap-review.v1',status:issues.length?'HELD':'KINEMATIC_CANDIDATE',
    issues,kinematicsVerified:issues.length===0,creativeApproved:false,
    metrics:{firstGapMeters:+gaps[0].toFixed(4),minGapMeters:+Math.min(...gaps).toFixed(4),
      contactTimeSec:contact>=0?samples[contact].timeSec:null,
      releaseTimeSec:release>=0?samples[release].timeSec:null,
      relativeMiddleTipTravelMeters:+travel.toFixed(4),peakRelativeTipSpeedMps:+speed.toFixed(3),
      scheduledAudioOffsetSec:release>=0&&finite(sound)?+(sound-samples[release].timeSec).toFixed(4):null},
    note:'Measures 3D bone motion and scheduled cue, NOT actual sound waveform, aesthetics, anatomy or creative approval.'};
}
