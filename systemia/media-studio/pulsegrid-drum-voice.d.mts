export type PulseGridDrumVoice={
 kind:'kick'|'hat';time:number;velocity:number;stop_time:number;
 noiseBuffer:AudioBuffer|null;
};
export function schedulePulseGridDrumVoice(input:{
 context:BaseAudioContext;destination:AudioNode;kind:'kick'|'hat';
 time:number;velocity:number;noiseBuffer?:AudioBuffer|null;
 createOscillator?:()=>OscillatorNode;
 createBufferSource?:()=>AudioBufferSourceNode;
}):PulseGridDrumVoice;
