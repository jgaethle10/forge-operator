/**
 * One synth-note oscillator envelope shared by realtime PulseGrid and bounded
 * OfflineAudioContext. This preserves the existing engine's triangle/saw/sine,
 * pitch, attack and exponential note release without a second sound design.
 */
export function schedulePulseGridSynthVoice({
  context,destination,track_id,pitch,velocity,time,duration,createSource
}={}){
  if(!context||typeof context.createGain!=='function'||!destination||
     typeof createSource!=='function'||typeof track_id!=='string'||!track_id||
     !Number.isInteger(pitch)||pitch<0||pitch>127||
     !Number.isFinite(velocity)||velocity<=0||velocity>1||
     !Number.isFinite(time)||time<0||
     !Number.isFinite(duration)||duration<=0||duration>30)
    throw new Error('Invalid PulseGrid synth-note schedule');
  const oscillator=createSource();
  const gain=context.createGain();
  oscillator.type=track_id==='bass'?'sawtooth':track_id==='bell'?'sine':'triangle';
  const frequency=440*Math.pow(2,(pitch-69)/12);
  oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(.0001,time);
  gain.gain.exponentialRampToValueAtTime(Math.max(.005,velocity*.18),time+.008);
  gain.gain.setTargetAtTime(.0001,time+Math.max(.03,duration-.06),.03);
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time+duration+.12);
  return {
    track_id,pitch,velocity,start_time:time,duration,
    stop_time:time+duration+.12,
    waveform:oscillator.type,frequency_hz:frequency
  };
}
