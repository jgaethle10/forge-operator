import type {PulseGridAudioAsset} from './pulsegrid-session.js';
export type FoundrySampleLayer={
  asset_id:string;
  root_pitch:number;
  velocity_min:number;
  velocity_max:number;
  release_sec:number;
};
export type FoundryInstrumentPatch={
  kind:'recorded_piano_v1';
  max_transpose_semitones:2;
  samples:FoundrySampleLayer[];
};
export function validateFoundryPatch(patch:unknown,assets:PulseGridAudioAsset[]):true;
export function selectFoundrySample(patch:FoundryInstrumentPatch,pitch:number,velocity:number):{
  asset_id:string;
  root_pitch:number;
  playback_rate:number;
  release_sec:number;
};
export function scheduleFoundryPianoNote(input:{
  context:AudioContext;
  destination:AudioNode;
  buffer:AudioBuffer;
  pitch:number;
  velocity:number;
  time:number;
  duration:number;
  selection:{asset_id:string;playback_rate:number;release_sec:number};
  createSource:()=>AudioBufferSourceNode;
}):{asset_id:string;start_time:number;stop_time:number;release_start:number;playback_rate:number;commercial_rights_verified:false};
