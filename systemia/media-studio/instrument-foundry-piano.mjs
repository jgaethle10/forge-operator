/** Instrument Foundry: explicit sample coverage and expressive playback, never synthesize missing evidence. */
const ASSET=/^audio-sha256:[a-f0-9]{64}$/;

export function validateFoundryPatch(patch,assets){
  if(!patch||patch.kind!=='recorded_piano_v1'||!Array.isArray(patch.samples)||
    patch.samples.length<1||patch.samples.length>64||patch.max_transpose_semitones!==2){
    throw new Error('Invalid or unsupported Foundry instrument patch');
  }
  const byId=new Map((assets||[]).map(a=>[a.id,a]));
  const identities=new Set();
  for(const sample of patch.samples){
    if(!sample||typeof sample.asset_id!=='string'||!ASSET.test(sample.asset_id)||
       !Number.isInteger(sample.root_pitch)||sample.root_pitch<21||sample.root_pitch>108||
       !Number.isFinite(sample.velocity_min)||!Number.isFinite(sample.velocity_max)||
       sample.velocity_min<0||sample.velocity_max>1||sample.velocity_min>=sample.velocity_max ||
       !Number.isFinite(sample.release_sec)||sample.release_sec<.03||sample.release_sec>1.5){
      throw new Error('Malformed Foundry sample layer');
    }
    const asset=byId.get(sample.asset_id);
    if(!asset||asset.rights==='restricted'||!['owned','licensed','unknown'].includes(asset.rights)){
      throw new Error('Foundry sample is missing or restricted in canonical assets');
    }
    if(!Number.isFinite(asset.duration_sec)||asset.duration_sec<=0)throw new Error('Invalid Foundry recording duration');
    const layerKey=[sample.asset_id,sample.root_pitch,sample.velocity_min,sample.velocity_max].join(':');
    if(identities.has(layerKey))throw new Error('Duplicate Foundry sample layer');
    identities.add(layerKey);
    for(const prior of patch.samples){
      if(prior===sample)break;
      if(prior.root_pitch!==sample.root_pitch)continue;
      if(Math.max(prior.velocity_min,sample.velocity_min)<
         Math.min(prior.velocity_max,sample.velocity_max)){
        throw new Error('Overlapping piano velocity layers for one recorded root pitch');
      }
    }
  }
  return true;
}


/**
 * Append a verified recording as another note/velocity layer without replacing
 * previously approved takes. Never self-certifies sample rights.
 *
 * Overlaps at the SAME root pitch are rejected: ambiguous dynamic layers
 * must be explicitly re-recorded or edited rather than silently selected.
 */
export function appendFoundryPianoSample(patch,layer,assets){
  const current=patch||{kind:'recorded_piano_v1',max_transpose_semitones:2,samples:[]};
  if(!layer || typeof layer!=='object')throw new Error('A recorded piano layer is required');
  const next={
    kind:'recorded_piano_v1',
    max_transpose_semitones:2,
    samples:[...current.samples, {
      asset_id:layer.asset_id,
      root_pitch:layer.root_pitch,
      velocity_min:layer.velocity_min,
      velocity_max:layer.velocity_max,
      release_sec:layer.release_sec,
    }],
  };
  // A new patch may begin from no samples. A pre-existing patch must have
  // valid immutable references and may not be silently switched to another kind.
  if(patch)validateFoundryPatch(patch,assets);
  validateFoundryPatch(next,assets);
  return next;
}

export function selectFoundrySample(patch,pitch,velocity){
  if(!Number.isInteger(pitch)||pitch<0||pitch>127||!Number.isFinite(velocity)||velocity<=0||velocity>1){
    throw new Error('Invalid Foundry musical note');
  }
  const candidates=patch.samples.filter(s=>pitch>=s.root_pitch-patch.max_transpose_semitones &&
    pitch<=s.root_pitch+patch.max_transpose_semitones &&
    velocity>s.velocity_min && velocity<=s.velocity_max);
  if(!candidates.length)throw new Error('No actual Foundry recording covers pitch and velocity');
  candidates.sort((a,b)=>Math.abs(pitch-a.root_pitch)-Math.abs(pitch-b.root_pitch)||
    a.asset_id.localeCompare(b.asset_id));
  const sample=candidates[0];
  return {asset_id:sample.asset_id,root_pitch:sample.root_pitch,
    playback_rate:Math.pow(2,(pitch-sample.root_pitch)/12),
    release_sec:sample.release_sec,velocity_min:sample.velocity_min,velocity_max:sample.velocity_max};
}

/**
 * Conservative velocity response for *actual* separately-recorded dynamic layers.
 * Recorded pianissimo already contains softer hammer physics. Applying full MIDI
 * attenuation again suppresses its body a second time. This bounded curve only
 * engages on specifically mapped velocity layers. Single-sample legacy patches
 * keep their established gain, and no missing timbral layer is synthesized.
 * This is an audition hypothesis, not a listener-quality certification.
 */
export function foundryPianoVoiceGain(velocity,selection){
  if(!Number.isFinite(velocity)||velocity<=0||velocity>1)throw new Error('Invalid piano velocity');
  const min=selection?.velocity_min,max=selection?.velocity_max;
  const hasDistinctRecordedLayer=Number.isFinite(min)&&Number.isFinite(max)&&
    min>=0&&max<=1&&min<max&&(max-min)<0.999;
  return Math.max(0.0001,0.68*Math.pow(velocity,hasDistinctRecordedLayer?0.82:1));
}

/**
 * Decoded-PCM attack guard for acoustic takes. A zero-aligned recording may
 * bring its own hammer onset; a fixed 4 ms linear fade can erase that detail.
 * A cut-in at a nonzero waveform needs a longer microfade to avoid a click.
 * Inspect at most two channels x 1.5 ms, never resample/edit source bytes.
 *
 * Evidence is only a sample-boundary heuristic, NOT audible verification.
 * Host test doubles/unsupported buffers retain the established safe 4 ms.
 */
export function planFoundryPianoAttack(buffer){
  const legacy={attack_sec:.004,profile:'uninspected_legacy_guard'};
  if(!buffer||typeof buffer.getChannelData!=='function'||
     !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
     !Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
     buffer.numberOfChannels>2)return legacy;
  const samples=Math.min(256,Math.ceil(buffer.sampleRate*.0015));
  const onsetFrames=Math.min(3,samples);
  const firstThird=Math.min(samples,Math.ceil(buffer.sampleRate*.00035));
  let onset=0,firstWindow=0;
  try{
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const pcm=buffer.getChannelData(channel);
      if(!pcm||pcm.length<samples)return legacy;
      for(let i=0;i<samples;i++){
        const value=Math.abs(pcm[i]);
        if(!Number.isFinite(value)||value>1.01)return legacy;
        if(i<onsetFrames)onset=Math.max(onset,value);
        if(i<firstThird)firstWindow=Math.max(firstWindow,value);
      }
    }
  }catch{return legacy}
  if(onset<.002&&firstWindow<.08)
    return {attack_sec:.0005,profile:'zero_aligned_fast_attack'};
  if(onset<.015)
    return {attack_sec:.0015,profile:'bounded_early_onset_guard'};
  return {attack_sec:.003,profile:'cut_in_microfade_guard'};
}

/**
 * Conservative, non-destructive pre-roll alignment for OWN decoded WAV data.
 * Some captures contain operator silence before the actual struck note,
 * causing late MIDI articulation. Only align a clear transient following
 * >=12 ms of very low-level audio. Preserve 4 ms before the detected onset.
 *
 * A slow/pianissimo attack, noise, missing PCM, stereo disagreement, or
 * uncertain onset gets NO trim. Never mutate WAV bytes or create new audio.
 * Return an audition hypothesis, NOT a listener-approved sample edit.
 */
const preRollPlanCache=new WeakMap();
export function planFoundryPianoPreRoll(buffer){
  const unaligned={offset_sec:0,profile:'unaligned_safe'};
  if(!buffer||typeof buffer!=='object')return unaligned;
  if(preRollPlanCache.has(buffer))return preRollPlanCache.get(buffer);
  const finish=result=>{preRollPlanCache.set(buffer,result);return result};
  if(typeof buffer.getChannelData!=='function'||
     !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
     !Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
     buffer.numberOfChannels>2||
     !Number.isFinite(buffer.duration)||buffer.duration<.1)return finish(unaligned);
  const rate=buffer.sampleRate;
  const windowFrames=Math.max(4,Math.ceil(rate*.001));
  const maxFrames=Math.min(Math.floor(rate*.055),Math.floor(buffer.duration*rate));
  if(maxFrames<windowFrames*20)return finish(unaligned);
  const channelData=[];
  try{
    for(let c=0;c<buffer.numberOfChannels;c++){
      const pcm=buffer.getChannelData(c);
      if(!pcm||pcm.length<maxFrames)return finish(unaligned);
      channelData.push(pcm);
    }
  }catch{return finish(unaligned)}
  const levels=[];
  for(let start=0;start+windowFrames<=maxFrames;start+=windowFrames){
    let energy=0,count=0;
    for(const pcm of channelData){
      for(let i=start;i<start+windowFrames;i++){
        const v=pcm[i];
        if(!Number.isFinite(v)||Math.abs(v)>1.01)return finish(unaligned);
        energy+=v*v;count++;
      }
    }
    levels.push(Math.sqrt(energy/count));
  }
  // First 8 ms must actually be quiet, not an early soft attack.
  const firstEight=Math.min(8,levels.length);
  if(Math.max(...levels.slice(0,firstEight))>.001)return finish(unaligned);
  // Need two consecutive 1ms windows with convincing pitched onset energy,
  // and the four preceding windows quiet, to avoid isolated clicks.
  for(let i=12;i<levels.length-1;i++){
    if(levels[i]<.006||levels[i+1]<.006)continue;
    const previous=levels.slice(i-4,i);
    if(previous.some(v=>v>.0015))continue;
    const onsetTime=i*windowFrames/rate;
    const offset=Math.max(0,onsetTime-.004);
    if(offset>0&&offset<.052&&offset<buffer.duration-.03)
      return finish({offset_sec:Number(offset.toFixed(6)),
        profile:'verified_quiet_preroll_aligned'});
  }
  return finish(unaligned);
}

export function scheduleFoundryPianoNote({
  context,destination,buffer,pitch,velocity,time,duration,selection,createSource
}){
  if(!context||!destination||!buffer||typeof createSource!=='function'||
     !Number.isFinite(buffer.duration)||buffer.duration<=0 ||
     !Number.isFinite(time)||time<0||!Number.isFinite(duration)||duration<=0 ||
     !Number.isFinite(velocity)||velocity<=0||velocity>1 ||
     !selection||!Number.isFinite(selection.playback_rate)||selection.playback_rate<=0){
    throw new Error('Invalid Foundry piano performance schedule');
  }
  const gain=context.createGain();
  const source=createSource();
  source.buffer=buffer;
  source.playbackRate.setValueAtTime(selection.playback_rate,time);
  const preRoll=planFoundryPianoPreRoll(buffer);
  const playable=(buffer.duration-preRoll.offset_sec)/selection.playback_rate;
  // Natural sampler release: never schedule gain automation after the WAV is
  // exhausted, and always keep attack, key-off and end times ordered. An
  // excessive fade-length on a short sample would otherwise produce invalid
  // gain ramps, pops or unexpectedly silent notes.
  const sounding=Math.min(playable,duration+selection.release_sec);
  if(sounding<.012)throw new Error('Foundry sample too short for click-free piano release.');
  const attackPlan=planFoundryPianoAttack(buffer);
  const attackSeconds=Math.min(attackPlan.attack_sec,sounding*.15);
  const releaseSeconds=Math.min(selection.release_sec,sounding*.45);
  const attackEnd=time+attackSeconds;
  const end=time+sounding;
  const releaseStart=time+Math.max(attackSeconds,Math.min(duration,sounding-releaseSeconds));
  const voiceGain=foundryPianoVoiceGain(velocity,selection);
  gain.gain.setValueAtTime(.0001,time);
  gain.gain.linearRampToValueAtTime(voiceGain,attackEnd);
  gain.gain.setValueAtTime(voiceGain,releaseStart);
  // A bounded cosine-squared release eases both ends of the damper transition.
  // Four AudioParam segments avoid an abrupt slope change while preserving
  // the exact original WAV onset, timbre, and finite recorded tail.
  for(let step=1;step<=4;step++){
    const progress=step/4;
    const shape=Math.cos(Math.PI*progress/2)**2;
    const level=.0001+(voiceGain-.0001)*shape;
    gain.gain.linearRampToValueAtTime(level,releaseStart+(end-releaseStart)*progress);
  }
  source.connect(gain);
  gain.connect(destination);
  source.start(time,preRoll.offset_sec);
  source.stop(end);
  return {asset_id:selection.asset_id,start_time:time,stop_time:end,release_start:releaseStart,
    playback_rate:selection.playback_rate,voice_gain:voiceGain,
    attack_sec:attackSeconds,attack_profile:attackPlan.profile,
    source_offset_sec:preRoll.offset_sec,pre_roll_profile:preRoll.profile,
    release_curve:'cosine_squared_4',commercial_rights_verified:false};
}
