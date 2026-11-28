/**
 * Canonical authored CC64-style pedal event contract for the recorded-piano
 * audition path. Notes stay unchanged; only their key-off release is deferred
 * while the authored pedal state is down. No acoustic damper physics is inferred.
 */
export function validateFoundryPedalEvents(events,clipSteps){
  if(!Number.isInteger(clipSteps)||clipSteps<16||clipSteps>256)throw new Error('Invalid Foundry pedal clip steps');
  if(!Array.isArray(events)||events.length>64)throw new Error('Invalid Foundry pedal event list');
  let prev=-1,previousDown=false;
  for(const event of events){
    if(!event||!Number.isInteger(event.step)||event.step<=prev||event.step<0||
       event.step>=clipSteps||typeof event.down!=='boolean')
      throw new Error('Invalid Foundry pedal event');
    if(event.down===previousDown)throw new Error('Foundry pedal events must alternate state');
    prev=event.step;previousDown=event.down;
  }
  return true;
}

/**
 * Return total key-held + pedal-held steps for an authored note.
 * A lift at exactly key-off cancels sustain; a pedal-down after key-off
 * cannot resurrect a released key. Playback ends at the end of the clip,
 * even if the pedal is still down. WAV byte duration is separately enforced.
 */
export function foundryPedalDurationSteps({events=[],start_step,length_steps,clip_steps}={}){
  validateFoundryPedalEvents(events,clip_steps);
  if(!Number.isInteger(start_step)||start_step<0||start_step>=clip_steps||
     !Number.isFinite(length_steps)||length_steps<=0||
     start_step+length_steps>clip_steps+1e-9)
    throw new Error('Invalid Foundry pedal note span');
  const keyOff=start_step+length_steps;
  let down=false,position=0;
  while(position<events.length&&events[position].step<=keyOff){
    down=events[position].down;
    position++;
  }
  if(!down)return length_steps;
  const lift=events.slice(position).find(event=>!event.down);
  const pedalOff=Math.min(clip_steps,lift?.step??clip_steps);
  return Math.max(length_steps,pedalOff-start_step);
}
