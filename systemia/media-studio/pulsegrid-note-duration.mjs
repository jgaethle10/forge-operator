/**
 * Returns elapsed musical note duration across PulseGrid's 16th-note steps.
 * A held note over a swung pair must contain BOTH the long and short step.
 * Never humanizes the source: this is faithful reproduction of recorded MIDI.
 */
export function pulseGridNoteDurationSeconds({
  bpm,swing=0,start_step,length_steps,
}={}){
  if(!Number.isFinite(bpm)||bpm<=0||bpm>400||
     !Number.isFinite(swing)||swing<0||swing>80||
     !Number.isInteger(start_step)||start_step<0||
     !Number.isFinite(length_steps)||length_steps<=0||length_steps>256){
    throw new Error('Invalid PulseGrid note duration input');
  }
  const base=60/bpm/4, ratio=swing/100*.45;
  let whole=Math.floor(length_steps),fraction=length_steps-whole,seconds=0;
  for(let i=0;i<whole;i++){
    seconds+=base*((start_step+i)%2===0?1+ratio:1-ratio);
  }
  if(fraction>0){
    seconds+=fraction*base*((start_step+whole)%2===0?1+ratio:1-ratio);
  }
  return seconds;
}
