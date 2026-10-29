/**
 * One playback scheduler for both ordinary loops and one-shot acoustic takes.
 * Keeps Web Audio work inside PulseGridAudioEngine while making audible
 * repeat/one-shot behavior directly testable without a fake recording claim.
 */
export function schedulePulseGridAudioBuffer({buffer,time,duration,mode='loop',destination,createSource}){
  if(!buffer || !Number.isFinite(buffer.duration) || buffer.duration<=0){
    throw new Error('Valid decoded audio buffer required for scheduling');
  }
  if(!Number.isFinite(time)||time<0||!Number.isFinite(duration)||duration<=0){
    throw new Error('Invalid PulseGrid audio schedule time/duration');
  }
  if(mode!=='loop'&&mode!=='one_shot')throw new Error('Invalid audio playback mode');
  if(typeof createSource!=='function'||!destination)throw new Error('Web Audio source and destination required');
  const source=createSource();
  source.buffer=buffer;
  const shouldLoop=mode==='loop'&&buffer.duration<duration;
  source.loop=shouldLoop;
  if(shouldLoop){
    source.loopEnd=Math.max(0.01,buffer.duration);
    source.connect(destination);
    source.start(time);
    source.stop(time+duration);
    return {mode,looped:true,scheduled_duration_sec:duration};
  }
  const playFor=Math.min(buffer.duration,duration);
  source.connect(destination);
  source.start(time,0,playFor);
  return {mode,looped:false,scheduled_duration_sec:playFor};
}
