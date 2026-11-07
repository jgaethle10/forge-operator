/**
 * Shared PulseGrid drum scheduling, exactly preserving the live kick/hat
 * parameter envelopes. Drum probabilities are resolved by the caller first;
 * a replay must use the actual noise AudioBuffer already heard live.
 */
export function schedulePulseGridDrumVoice({
  context,destination,kind,time,velocity,noiseBuffer,
  createOscillator,createBufferSource
}={}){
  if(!context||typeof context.createGain!=='function'||!destination||
     !['kick','hat'].includes(kind)||!Number.isFinite(time)||time<0||
     !Number.isFinite(velocity)||velocity<=0||velocity>1||
     (kind==='kick'&&typeof createOscillator!=='function')||
     (kind==='hat'&&(
       typeof createBufferSource!=='function'||typeof context.createBiquadFilter!=='function'||
       !noiseBuffer||!Number.isFinite(noiseBuffer.duration)||noiseBuffer.duration<=0)))
    throw new Error('Invalid PulseGrid drum performance schedule');
  if(kind==='kick'){
    const oscillator=createOscillator();
    const gain=context.createGain();
    oscillator.type='sine';
    oscillator.frequency.setValueAtTime(135,time);
    oscillator.frequency.exponentialRampToValueAtTime(46,time+.12);
    gain.gain.setValueAtTime(Math.max(.001,.7*velocity),time);
    gain.gain.exponentialRampToValueAtTime(.001,time+.22);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time+.24);
    return {kind,time,velocity,stop_time:time+.24,noiseBuffer:null};
  }
  const source=createBufferSource();
  const highpass=context.createBiquadFilter(),gain=context.createGain();
  source.buffer=noiseBuffer;
  highpass.type='highpass';
  highpass.frequency.value=6200;
  gain.gain.setValueAtTime(Math.max(.001,.18*velocity),time);
  gain.gain.exponentialRampToValueAtTime(.001,time+.055);
  source.connect(highpass).connect(gain).connect(destination);
  source.start(time);
  source.stop(time+.065);
  return {kind,time,velocity,stop_time:time+.065,noiseBuffer};
}
