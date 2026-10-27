/**
 * Bounded, authorized OFFLINE sample-piano track-bus and master audition.
 *
 * This renders the exact basic piano bus topology from PulseGridAudioEngine:
 * sampled source -> track input gain -> Biquad lowpass -> [dry + feedback
 * delay/wet] -> master gain. It is purposely NOT a final/full-song mix:
 * non-Foundry tracks, time-varying clip automation between selected note
 * onsets, live clock, device latency and mastering are excluded.
 *
 * No code ever writes back to the canonical session or the original WAV.
 */
import {scheduleFoundryPianoNote} from './instrument-foundry-piano.mjs';
import {unavailableFoundryPianoDryPeak} from './instrument-foundry-dry-pcm.mjs';

const RESULT_SCOPE='offline_sampled_piano_track_bus_approximation';
const rate=48000,MAX_VOICES=16,WINDOW=.8;
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const db=x=>x>0?Number((20*Math.log10(x)).toFixed(2)):-180;
const unavailable=reason=>({
  status:'unavailable',scope:RESULT_SCOPE,reason,peak_dbfs:null,
  sample_peak:null,over_full_scale_frames:null,complete:false,
  analyzed_voices:0,source_kind:'decoded_pcm_only',
});

function validated(input){
  const {voices,tracks}=input??{};
  if(!Array.isArray(voices)||!voices.length||voices.length>MAX_VOICES||
     !Array.isArray(tracks)||!tracks.length)
    return 'Choose 1–16 authorized recorded-piano voices.';
  const indexed=new Map(tracks.map(t=>[t.id,t]));
  if(indexed.size!==tracks.length)return 'Ambiguous recorded-piano track IDs.';
  for(const v of voices){
    if(!v||typeof v.track_id!=='string'||!indexed.has(v.track_id)||
      !Number.isInteger(v.pitch)||v.pitch<0||v.pitch>127||
      !Number.isFinite(v.velocity)||v.velocity<=0||v.velocity>1||
      !Number.isFinite(v.start_time)||v.start_time<0||
      !Number.isFinite(v.duration)||v.duration<=0||
      !Number.isFinite(v.stop_time)||v.stop_time<=v.start_time||
      !v.buffer||typeof v.buffer.getChannelData!=='function'||
      !Number.isFinite(v.buffer.duration)||v.buffer.duration<.012||
      !v.selection||!Number.isFinite(v.selection.playback_rate)||
      !Number.isFinite(v.selection.release_sec))
      return 'Invalid or unavailable authorized recorded-piano playback voice.';
  }
  for(const t of tracks){
    if(!t||typeof t.id!=='string'||!t.id||
      ![t.volume,t.filterHz,t.delayMix,t.delayTime,t.delayFeedback,t.autoVolume,t.autoFilter]
        .every(Number.isFinite))
      return 'Invalid PulseGrid track/effects snapshot.';
  }
  return null;
}

/**
 * Browser OfflineAudioContext can be injected by the caller. This makes
 * offline audio rendering explicit and independently testable; it never
 * silently spins up real-time playback or pulls from storage.
 */
export async function renderFoundryPianoOfflineBus({voices,tracks,offlineContextFactory}={}){
  const invalid=validated({voices,tracks});
  if(invalid)return unavailable(invalid);
  if(typeof offlineContextFactory!=='function')
    return unavailable('OfflineAudioContext is unavailable in this browser.');
  const earliest=Math.min(...voices.map(v=>v.start_time));
  const latest=Math.max(...voices.map(v=>v.stop_time));
  // Approximation deliberately bounded; a long song needs a separately
  // approved render route, not a silently truncated "whole mix" certificate.
  if(latest-earliest>WINDOW)
    return unavailable('The piano passage exceeds the 0.8-second offline review window.');
  if(tracks.length>8)return unavailable('Track bus count exceeds the offline review budget.');
  const frames=Math.ceil(WINDOW*rate);
  let context;
  try{
    context=offlineContextFactory(2,frames,rate);
    if(!context||typeof context.startRendering!=='function'||
      typeof context.createGain!=='function'||typeof context.createDelay!=='function'||
      typeof context.createBiquadFilter!=='function'||
      typeof context.createBufferSource!=='function')
      return unavailable('OfflineAudioContext is not supported.');
    const master=context.createGain();
    master.gain.setValueAtTime(.72,0);
    master.connect(context.destination);
    const buses=new Map();
    for(const t of tracks){
      const input=context.createGain(),filter=context.createBiquadFilter();
      const dry=context.createGain(),delay=context.createDelay(1);
      const feedback=context.createGain(),wet=context.createGain();
      filter.type='lowpass';filter.Q.value=.6;
      input.connect(filter);filter.connect(dry).connect(master);
      filter.connect(delay);delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(master);
      input.gain.setValueAtTime(Math.max(0,t.volume*t.autoVolume),0);
      filter.frequency.setValueAtTime(bound(t.filterHz*Math.max(.08,t.autoFilter),80,19000),0);
      delay.delayTime.setValueAtTime(bound(t.delayTime,.02,.8),0);
      feedback.gain.setValueAtTime(bound(t.delayFeedback,0,.78),0);
      wet.gain.setValueAtTime(bound(t.delayMix,0,.65),0);
      dry.gain.setValueAtTime(1,0);
      buses.set(t.id,input);
    }
    for(const v of voices){
      // Preserve source bytes and exact note selection; only shift the
      // authorised already-scheduled chord to the offline timeline origin.
      scheduleFoundryPianoNote({
        context,destination:buses.get(v.track_id),buffer:v.buffer,
        pitch:v.pitch,velocity:v.velocity,
        time:v.start_time-earliest,duration:v.duration,
        selection:v.selection,
        createSource:()=>context.createBufferSource(),
      });
    }
    const rendered=await context.startRendering();
    if(!rendered||typeof rendered.getChannelData!=='function'||
       rendered.numberOfChannels!==2||rendered.length!==frames)
      return unavailable('Offline render returned an inconsistent audio buffer.');
    let peak=0,over=0,sum=0;
    const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
    if(!left||!right||left.length!==frames||right.length!==frames)
      return unavailable('Offline render returned incomplete PCM channels.');
    for(let i=0;i<frames;i++){
      const a=left[i],b=right[i];
      if(!Number.isFinite(a)||!Number.isFinite(b))
        return unavailable('Offline audio contains invalid or nonfinite PCM.');
      peak=Math.max(peak,Math.abs(a),Math.abs(b));
      if(Math.abs(a)>1||Math.abs(b)>1)over++;
      sum+=a*a+b*b;
    }
    return {
      status:'offline_track_bus_pcm_measurement',scope:RESULT_SCOPE,
      sample_peak:Number(peak.toFixed(5)),peak_dbfs:db(peak),
      rms_dbfs:db(Math.sqrt(sum/(frames*2))),
      over_full_scale_frames:over,
      // The finite audition window covers all selected note voices, but a
      // feedback-delay path may carry a residual tail beyond the window.
      source_notes_within_window:true,
      effects_tail_complete:tracks.every(t=>t.delayMix===0),
      complete:tracks.every(t=>t.delayMix===0),
      analyzed_voices:voices.length,rendered_frames:frames,
      window_sec:WINDOW,rate,
      source_kind:'decoded_pcm_only',
      limitations:'Recorded-piano voices only. Uses frozen note-on track/filter/delay snapshot plus master .72 and a bounded 0.8s window. Excludes all other tracks and automation changes, mastering/true peak and device output. Does not certify audible quality or commercial rights.',
    };
  }catch(error){
    return unavailable('Offline browser track-bus rendering failed: '+(error instanceof Error?error.message:'unsupported audio graph'));
  }
}
