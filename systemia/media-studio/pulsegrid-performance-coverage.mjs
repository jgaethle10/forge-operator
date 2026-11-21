/**
 * Verifies contiguous, ACTUALLY SCHEDULED PulseGrid transport steps.
 *
 * Not speaker output or proof that a sound played to completion. A future
 * step scheduled before Stop remains a scheduling receipt, not listening
 * evidence. The first missing, mistimed or out-of-order step ends coverage:
 * earliest/latest timestamps must never bridge holes or re-ordered bars.
 */
const EPS=.008; // bounded clock precision, not interpolation of missing bars
const MAX_STEPS=1024;
const MAX_SPAN=8;
const r3=x=>Number(x.toFixed(3));
const bad=reason=>({
  status:'unavailable',reason,performance_coverage_sec:0,
  performance_window_complete:false,performed_step_count:0,
  performance_gap_count:0,first_gap_at_sec:null,
  evidence:'observed_scheduled_steps_only'
});
export function inspectPulseGridPerformedStepCoverage({events,origin,window_sec}={}){
  if(!Array.isArray(events)||!events.length||events.length>MAX_STEPS||
     !Number.isFinite(origin)||origin<0||![.8,8].includes(window_sec))
    return bad('Missing or unbounded performed transport-step receipts.');
  for(const e of events){
    if(!e||!Number.isInteger(e.step)||e.step<0||
       !Number.isInteger(e.loop_steps)||e.loop_steps<1||e.loop_steps>512||
       e.step>=e.loop_steps||!Number.isFinite(e.time)||e.time<0||
       !Number.isFinite(e.duration)||e.duration<=0||e.duration>2)
      return bad('Invalid performed transport step, duration or loop index.');
  }
  // Require chronological, nonduplicated playback receipts. The engine
  // schedules monotonically; sorting would hide an accidental clock reset.
  for(let i=1;i<events.length;i++)
    if(events[i].time<=events[i-1].time+1e-8)
      return bad('Unordered or duplicated transport-step receipts.');
  const end=origin+window_sec;
  const interesting=events.filter(e=>e.time<end+EPS&&e.time+e.duration>origin-EPS);
  if(!interesting.length)return bad('No performed transport steps cover the chosen audio origin.');
  const first=interesting.findLastIndex(e=>e.time<=origin+EPS&&e.time+e.duration>=origin-EPS);
  if(first<0)return bad('Transport performance began after the first authorized sound.');
  let prev=interesting[first],coveredEnd=Math.min(end,prev.time+prev.duration);
  let gaps=0,firstGap=null;
  for(let i=first+1;i<interesting.length;i++){
    const next=interesting[i];
    if(next.time>=end-EPS)break;
    const expectedStep=(prev.step+1)%prev.loop_steps;
    const timingGap=Math.abs(next.time-(prev.time+prev.duration));
    if(next.step!==expectedStep||next.loop_steps!==prev.loop_steps||timingGap>EPS){
      gaps++;
      if(firstGap===null)firstGap=r3(Math.max(0,coveredEnd-origin));
      // The first discontinuity is the coverage boundary. Later timestamps
      // are NOT proof of an uninterrupted performed phrase.
      break;
    }
    coveredEnd=Math.min(end,next.time+next.duration);
    prev=next;
  }
  const covered=Math.min(window_sec,Math.max(0,coveredEnd-origin));
  // Incomplete, even when a receipt ends within a tiny tolerance of target:
  // leave genuine end-of-window coverage exact.
  const complete=covered>=window_sec-EPS&&gaps===0;
  return {
    status:'verified_scheduled_step_contiguity',
    performance_coverage_sec:r3(covered),
    performance_window_complete:complete,
    performed_step_count:interesting.length,
    performance_gap_count:gaps,
    first_gap_at_sec:firstGap,
    evidence:'observed_scheduled_steps_only',
    caution:'Measures contiguous scheduled transport steps, not actual speaker playback, rendered DSP tails, or an entire completed recording.',
  };
}
