/**
 * Explicit, bounded OFFLINE decoded-PCM dry-piano chord audit.
 *
 * Reconstructs scheduled sample voices from the authorized browser's decoded
 * AudioBuffers, source offsets, playback rates and original four-segment
 * gain envelopes. NO mutation and NO new Web Audio playback.
 *
 * This is a sample-peak of a PCM-only offline approximation BEFORE the track
 * filter, delays, bus volume, master and device output; not measured device
 * audio, a true-peak meter, LUFS, or a commercial/mastering certificate.
 */
const MAX_VOICES=16;
const MAX_FRAMES=38400; // 0.8 sec x 48kHz: bounded on mobile
const db=v=>v>0?Number((20*Math.log10(v)).toFixed(2)):-180;
const round=v=>Number(v.toFixed(5));

function gainAt(voice,t){
  const age=t-voice.start_time;
  if(age<0||t>=voice.stop_time)return 0;
  const attack=Math.min(voice.attack_sec,voice.stop_time-voice.start_time);
  if(age<attack)return .0001+(voice.voice_gain-.0001)*(age/attack);
  if(t<=voice.release_start)return voice.voice_gain;
  const release=voice.stop_time-voice.release_start;
  if(release<=0)return .0001;
  const x=Math.min(1,Math.max(0,(t-voice.release_start)/release));
  const k=Math.min(3,Math.floor(x*4));
  const a=k/4,b=(k+1)/4,part=(x-a)/(b-a);
  const level=p=>.0001+(voice.voice_gain-.0001)*Math.cos(Math.PI*p/2)**2;
  return level(a)+(level(b)-level(a))*part;
}
export function unavailableFoundryPianoDryPeak(reason){
  return {status:'unavailable',reason,scope:'decoded_sampled_piano_dry_approximation',
    sample_peak:null,peak_dbfs:null,over_full_scale_frames:null,
    examined_frames:0,analyzed_voices:0,complete:false};
}

/**
 * Explicitly demand complete coverage of the selected audition window.
 * Never emit a misleading zero peak for absent/unauthorized/unsupported PCM.
 */
export function analyzeFoundryDecodedPianoDryPeak({voices,rate=48000,window_sec=.8}={}){
  if(!Array.isArray(voices)||voices.length===0)return unavailableFoundryPianoDryPeak('No scheduled sampled-piano voices to inspect.');
  if(voices.length>MAX_VOICES)return unavailableFoundryPianoDryPeak('Too many scheduled notes for bounded dry-PCM audit; inspect a shorter phrase.');
  if(![12000,24000,48000].includes(rate)||!Number.isFinite(window_sec)||
    window_sec<=0||window_sec>.8)return unavailableFoundryPianoDryPeak('Invalid PCM audit rate/window.');
  const earliest=Math.min(...voices.map(v=>v.start_time));
  if(!Number.isFinite(earliest)||earliest<0)return unavailableFoundryPianoDryPeak('Invalid scheduled note start.');
  const frames=Math.min(MAX_FRAMES,Math.ceil(rate*window_sec));
  const left=new Float64Array(frames),right=new Float64Array(frames);
  for(const voice of voices){
    const required=['start_time','stop_time','release_start','attack_sec',
      'voice_gain','playback_rate','source_offset_sec'];
    if(!voice||required.some(k=>!Number.isFinite(voice[k]))||
       voice.start_time<0||voice.stop_time<=voice.start_time||
       voice.release_start<=voice.start_time||voice.release_start>=voice.stop_time||
       voice.attack_sec<=0||voice.attack_sec>=voice.stop_time-voice.start_time||
       voice.voice_gain<=0||voice.voice_gain>1||
       voice.playback_rate<.5||voice.playback_rate>2||
       voice.source_offset_sec<0)return unavailableFoundryPianoDryPeak('Invalid scheduled piano envelope.');
    const b=voice.buffer;
    if(!b||typeof b.getChannelData!=='function'||
       !Number.isFinite(b.duration)||b.duration<=0||
       !Number.isFinite(b.sampleRate)||b.sampleRate<8000||b.sampleRate>192000||
       ![1,2].includes(b.numberOfChannels))return unavailableFoundryPianoDryPeak('Decoded PCM is unavailable for at least one sampled voice.');
    if(voice.source_offset_sec+(voice.stop_time-voice.start_time)*voice.playback_rate>
       b.duration+.0005)return unavailableFoundryPianoDryPeak('Scheduled voice exceeds available decoded WAV frames.');
    let pcm;
    try{
      pcm=Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i));
    }catch{return unavailableFoundryPianoDryPeak('Decoded PCM channel access failed.')}
    if(pcm.some(ch=>!ch||ch.length<2||ch.length/b.sampleRate<b.duration-.003))
      return unavailableFoundryPianoDryPeak('Decoded PCM is incomplete or inconsistent with the audio duration.');
    const first=Math.max(0,Math.ceil((voice.start_time-earliest)*rate));
    const last=Math.min(frames,Math.ceil((voice.stop_time-earliest)*rate));
    for(let frame=first;frame<last;frame++){
      const t=earliest+frame/rate;
      const absolutePosition=(voice.source_offset_sec+
        (t-voice.start_time)*voice.playback_rate)*b.sampleRate;
      if(absolutePosition<0||absolutePosition>=pcm[0].length-1)continue;
      const idx=Math.floor(absolutePosition),frac=absolutePosition-idx;
      const amp=gainAt(voice,t);
      if(!Number.isFinite(amp))return unavailableFoundryPianoDryPeak('Invalid interpolated note envelope.');
      const sample=c=>{
        const v=pcm[c][idx],next=pcm[c][idx+1];
        if(!Number.isFinite(v)||!Number.isFinite(next)||Math.abs(v)>1.01||Math.abs(next)>1.01)
          return NaN;
        return (v+(next-v)*frac)*amp;
      };
      const l=sample(0),r=b.numberOfChannels===2?sample(1):l;
      if(!Number.isFinite(l)||!Number.isFinite(r))return unavailableFoundryPianoDryPeak('Nonfinite or out-of-range decoded PCM.');
      left[frame]+=l;right[frame]+=r;
    }
  }
  let peak=0,over=0,sumSq=0;
  for(let i=0;i<frames;i++){
    peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    if(Math.abs(left[i])>1||Math.abs(right[i])>1)over++;
    sumSq+=left[i]*left[i]+right[i]*right[i];
  }
  return {
    status:'measured_offline_dry_approximation',
    scope:'decoded_sampled_piano_dry_approximation',
    sample_peak:round(peak),peak_dbfs:db(peak),
    rms_dbfs:db(Math.sqrt(sumSq/(frames*2))),
    over_full_scale_frames:over,examined_frames:frames,
    analyzed_voices:voices.length,
    complete:voices.every(v=>v.stop_time<=earliest+window_sec+1e-8),
    window_sec,rate,
    limitations:'Decoded piano-only PCM with linear resampling and scheduled gain envelopes. No track/master/effects, realtime output measurement, true peak, full mix or listener approval.',
  };
}
