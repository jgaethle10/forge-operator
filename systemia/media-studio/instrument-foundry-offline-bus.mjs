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
import {schedulePulseGridAudioBuffer} from './pulsegrid-audio-scheduler.mjs';
import {schedulePulseGridSynthVoice} from './pulsegrid-synth-voice.mjs';
import {schedulePulseGridDrumVoice} from './pulsegrid-drum-voice.mjs';
import {encodeFoundryAuditionWav} from './instrument-foundry-audition-wav.mjs';
import {unavailableFoundryPianoDryPeak} from './instrument-foundry-dry-pcm.mjs';

const RESULT_SCOPE='offline_sampled_piano_track_bus_approximation';
const rate=48000,MAX_VOICES=16,MAX_WINDOW=8;
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const db=x=>x>0?Number((20*Math.log10(x)).toFixed(2)):-180;
const unavailable=reason=>({
  status:'unavailable',scope:RESULT_SCOPE,reason,peak_dbfs:null,
  sample_peak:null,over_full_scale_frames:null,complete:false,
  analyzed_voices:0,source_kind:'decoded_pcm_only',
});

function validated(input){
  const {voices,tracks,audioBeds=[],synthVoices=[],drumVoices=[]}=input??{};
  if(!Array.isArray(voices)||!voices.length||voices.length>MAX_VOICES||
     !Array.isArray(tracks)||!tracks.length)
    return 'Choose 1–16 authorized recorded-piano voices.';
  const indexed=new Map(tracks.map(t=>[t.id,t]));
  if(indexed.size!==tracks.length)return 'Ambiguous recorded-piano track IDs.';
  if(!Array.isArray(drumVoices)||drumVoices.length>16)
    return 'Drum review exceeds the bounded 16 actual performed-hit limit.';
  for(const drum of drumVoices){
    if(!drum||typeof drum.track_id!=='string'||!indexed.has(drum.track_id)||
       !['kick','hat'].includes(drum.kind)||
       !Number.isFinite(drum.time)||drum.time<0||
       !Number.isFinite(drum.velocity)||drum.velocity<=0||drum.velocity>1||
       !Number.isFinite(drum.stop_time)||drum.stop_time<=drum.time||
       (drum.kind==='hat'&&(!drum.noiseBuffer||
         !Number.isFinite(drum.noiseBuffer.duration)||drum.noiseBuffer.duration<=0)))
      return 'Invalid performed drum hit or missing original hat-noise buffer.';
  }
  if(!Array.isArray(synthVoices)||synthVoices.length>16)
    return 'Unsampled synth review exceeds 16 scheduled-note limit.';
  for(const synth of synthVoices){
    if(!synth||typeof synth.track_id!=='string'||!indexed.has(synth.track_id)||
       !Number.isInteger(synth.pitch)||synth.pitch<0||synth.pitch>127||
       !Number.isFinite(synth.velocity)||synth.velocity<=0||synth.velocity>1||
       !Number.isFinite(synth.start_time)||synth.start_time<0||
       !Number.isFinite(synth.duration)||synth.duration<=0||synth.duration>30||
       !Number.isFinite(synth.stop_time)||synth.stop_time<=synth.start_time)
      return 'Invalid scheduled synth note or unknown bus.';
  }
  if(!Array.isArray(audioBeds)||audioBeds.length>4)
    return 'Audio-bed review exceeds the bounded four-source limit.';
  for(const bed of audioBeds){
    if(!bed||typeof bed.track_id!=='string'||!indexed.has(bed.track_id)||
       !bed.buffer||!Number.isFinite(bed.buffer.duration)||bed.buffer.duration<=0||
       !Number.isFinite(bed.start_time)||bed.start_time<0||
       !Number.isFinite(bed.duration)||bed.duration<=0||
       !['loop','one_shot'].includes(bed.mode))
      return 'Invalid authorized audio-bed source or schedule.';
  }
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
export async function renderFoundryPianoOfflineBus({voices,tracks,audioBeds=[],synthVoices=[],drumVoices=[],window_sec=.8,includeAuditionWav=false,offlineContextFactory}={}){
  if(![.8,8].includes(window_sec)||typeof includeAuditionWav!=='boolean')
    return unavailable('Review window must be 0.8 or 8 seconds, with an explicit audition request.');
  const invalid=validated({voices,tracks,audioBeds,synthVoices,drumVoices});
  if(invalid)return unavailable(invalid);
  if(typeof offlineContextFactory!=='function')
    return unavailable('OfflineAudioContext is unavailable in this browser.');
  const earliest=Math.min(...voices.map(v=>v.start_time),...audioBeds.map(v=>v.start_time),...synthVoices.map(v=>v.start_time),...drumVoices.map(v=>v.time));
  const latest=Math.max(...voices.map(v=>v.stop_time),...synthVoices.map(v=>v.stop_time),...drumVoices.map(v=>v.stop_time));
  // Approximation deliberately bounded; a long song needs a separately
  // approved render route, not a silently truncated "whole mix" certificate.
  if(latest-earliest>window_sec)
    return unavailable('Performed note passage exceeds the selected offline audition window.');
  if(audioBeds.some(bed=>bed.start_time-earliest>=window_sec))
    return unavailable('Audio-bed note-on is outside the bounded offline audition window.');
  if(tracks.length>8)return unavailable('Track bus count exceeds the offline review budget.');
  const frames=Math.ceil(window_sec*rate);
  if(frames>MAX_WINDOW*rate)return unavailable('Offline render exceeds the mobile-safe frame budget.');
  let context;
  try{
    context=offlineContextFactory(2,frames,rate);
    if(!context||typeof context.startRendering!=='function'||
      typeof context.createGain!=='function'||typeof context.createDelay!=='function'||
      typeof context.createBiquadFilter!=='function'||
      typeof context.createBufferSource!=='function'||
      ((synthVoices.length>0||drumVoices.some(v=>v.kind==='kick'))&&typeof context.createOscillator!=='function'))
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
    // Synthesize exact already-played oscillator voices through the identical
    // real-time PulseGrid scheduler, not a separate offline approximation.
    for(const v of synthVoices){
      schedulePulseGridSynthVoice({
        context,destination:buses.get(v.track_id),track_id:v.track_id,
        pitch:v.pitch,velocity:v.velocity,
        time:v.start_time-earliest,duration:v.duration,
        createSource:()=>context.createOscillator(),
      });
    }
    // Reproduce ONLY events that actually occurred during the original Play.
    // Hat replay reuses that exact realized noise buffer, not new random PCM.
    for(const v of drumVoices){
      schedulePulseGridDrumVoice({
        context,destination:buses.get(v.track_id),kind:v.kind,
        time:v.time-earliest,velocity:v.velocity,noiseBuffer:v.noiseBuffer,
        createOscillator:()=>context.createOscillator(),
        createBufferSource:()=>context.createBufferSource(),
      });
    }
    // Use the identical canonical scheduler as the live imported-audio track.
    // Duration is bounded to this explicit preview, never claimed whole-song.
    for(const bed of audioBeds){
      const offset=bed.start_time-earliest;
      const audible=Math.min(bed.duration,window_sec-offset);
      schedulePulseGridAudioBuffer({
        buffer:bed.buffer,time:offset,duration:audible,mode:bed.mode,
        destination:buses.get(bed.track_id),
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
    // Explicit internal audition only: 16-bit WAV clamps sample values above
    // full scale. The float-PCM peak receipt remains the authoritative
    // pre-encoding measurement. Never claim preview is a mastered output.
    const audition_wav_bytes=includeAuditionWav
      ?encodeFoundryAuditionWav(rendered,{maxSeconds:window_sec}):undefined;
    return {
      status:'offline_track_bus_pcm_measurement',scope:RESULT_SCOPE,
      sample_peak:Number(peak.toFixed(5)),peak_dbfs:db(peak),
      rms_dbfs:db(Math.sqrt(sum/(frames*2))),
      over_full_scale_frames:over,
      // The finite audition window covers all selected note voices, but a
      // feedback-delay path may carry a residual tail beyond the window.
      source_notes_within_window:true,
      effects_tail_complete:tracks.every(t=>t.delayMix===0),
      audio_beds_within_window:audioBeds.every(b=>b.start_time+b.duration<=earliest+window_sec+1e-8),
      complete:tracks.every(t=>t.delayMix===0)&&
        audioBeds.every(b=>b.start_time+b.duration<=earliest+window_sec+1e-8),
      analyzed_voices:voices.length,analyzed_audio_beds:audioBeds.length,
      analyzed_synth_voices:synthVoices.length,
      analyzed_drum_hits:drumVoices.length,rendered_frames:frames,
      window_sec,rate,audition_wav_bytes,
      audition_sample_clamped:includeAuditionWav&&peak>1,
      source_kind:(synthVoices.length||drumVoices.length)?'decoded_pcm_plus_synth':'decoded_pcm_only',
      limitations:'Recorded-piano voices, authorized imported audio beds plus original PulseGrid synth/drum events only. Uses frozen note-on track/filter/delay snapshots plus master .72 and selected <=8-second window. Excludes unperformed/probabilistically omitted events, additional unscheduled notes, remaining arrangement and automation changes, mastering/true peak and device output. Does not certify audible quality or commercial rights.',
    };
  }catch(error){
    return unavailable('Offline browser track-bus rendering failed: '+(error instanceof Error?error.message:'unsupported audio graph'));
  }
}
