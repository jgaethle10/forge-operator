/**
 * Web MIDI CC64 -> authored recorded-piano sustain events.
 *
 * This is an input parser and score operation planner, not a connected-device
 * playback receipt. MIDI 1.0 Control Change 64 uses values 0..63 for pedal up
 * and 64..127 for pedal down. Ignore other status bytes/controllers rather
 * than interpreting arbitrary inbound MIDI as pedal automation.
 */
import {validateFoundryPedalEvents} from './instrument-foundry-pedal.mjs';

export function decodeFoundryMidiSustain(data){
  if(!data||typeof data.length!=='number'||data.length<3)return null;
  const status=Number(data[0]),controller=Number(data[1]),value=Number(data[2]);
  if(![status,controller,value].every(x=>Number.isInteger(x)&&x>=0&&x<=255)||
    status<0x80||status>0xef||controller>127||value>127||
    (status&0xf0)!==0xb0||controller!==64)return null;
  return {channel:status&0x0f,value,down:value>=64};
}

/** Insert/overwrite at quantized step, retaining only real state transitions.
 * Repeated CC64 messages create no duplicate MIDI score events.
 */
export function mergeFoundryMidiPedalEvent(events,clipSteps,step,down){
  validateFoundryPedalEvents(events,clipSteps);
  if(!Number.isInteger(step)||step<0||step>=clipSteps||typeof down!=='boolean')
    throw new Error('Invalid MIDI pedal destination step/state');
  const sorted=[...events.filter(event=>event.step!==step),{step,down}]
    .sort((a,b)=>a.step-b.step);
  const result=[];
  let previous=false;
  for(const event of sorted){
    if(event.down!==previous){
      result.push(event);
      previous=event.down;
    }
  }
  validateFoundryPedalEvents(result,clipSteps);
  return result;
}

export function removeFoundryMidiPedalEvent(events,clipSteps,step){
  validateFoundryPedalEvents(events,clipSteps);
  if(!Number.isInteger(step)||step<0||step>=clipSteps)
    throw new Error('Invalid MIDI pedal removal step');
  const filtered=events.filter(event=>event.step!==step);
  const result=[];
  let previous=false;
  for(const event of filtered){
    if(event.down!==previous){result.push(event);previous=event.down;}
  }
  validateFoundryPedalEvents(result,clipSteps);
  return result;
}
