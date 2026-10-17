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
  }
  return true;
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
    release_sec:sample.release_sec};
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
  const playable=buffer.duration/selection.playback_rate;
  const end=time+Math.min(playable, duration+selection.release_sec);
  const releaseStart=Math.max(time+.005,Math.min(time+duration,end-.02));
  gain.gain.setValueAtTime(.0001,time);
  gain.gain.linearRampToValueAtTime(Math.max(.0001,velocity*.68),time+.004);
  gain.gain.setValueAtTime(Math.max(.0001,velocity*.68),releaseStart);
  gain.gain.linearRampToValueAtTime(.0001,end);
  source.connect(gain);
  gain.connect(destination);
  source.start(time);
  source.stop(end);
  return {asset_id:selection.asset_id,start_time:time,stop_time:end,release_start:releaseStart,
    playback_rate:selection.playback_rate,commercial_rights_verified:false};
}
