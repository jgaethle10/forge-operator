export type AudioPlaybackMode='loop'|'one_shot';
export function schedulePulseGridAudioBuffer(input:{
  buffer:Pick<AudioBuffer,'duration'>;
  time:number;
  duration:number;
  mode?:AudioPlaybackMode;
  destination:AudioNode;
  createSource:()=>AudioBufferSourceNode;
}):{mode:AudioPlaybackMode;looped:boolean;scheduled_duration_sec:number};
