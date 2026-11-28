export type PulseGridSynthVoice={
 track_id:string;pitch:number;velocity:number;start_time:number;
 duration:number;stop_time:number;waveform:'sine'|'triangle'|'sawtooth';
 frequency_hz:number;
};
export function schedulePulseGridSynthVoice(input:{
 context:BaseAudioContext;destination:AudioNode;track_id:string;
 pitch:number;velocity:number;time:number;duration:number;
 createSource:()=>OscillatorNode;
}):PulseGridSynthVoice;
