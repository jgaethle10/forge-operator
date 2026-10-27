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
export function appendFoundryPianoSample(
  patch:FoundryInstrumentPatch|null|undefined,
  layer:FoundrySampleLayer,
  assets:PulseGridAudioAsset[],
):FoundryInstrumentPatch;
export function validateFoundryPatch(patch:unknown,assets:PulseGridAudioAsset[]):true;
export function selectFoundrySample(patch:FoundryInstrumentPatch,pitch:number,velocity:number):{
  asset_id:string;
  root_pitch:number;
  playback_rate:number;
  release_sec:number;
  velocity_min:number;
  velocity_max:number;
};
export function foundryPianoVoiceGain(velocity:number, selection:Pick<FoundrySampleLayer,'velocity_min'|'velocity_max'>):number;
export type FoundryPianoAttackProfile='uninspected_legacy_guard'|'zero_aligned_fast_attack'|'bounded_early_onset_guard'|'cut_in_microfade_guard';
export function planFoundryPianoAttack(buffer:AudioBuffer):{attack_sec:number;profile:FoundryPianoAttackProfile};
export function scheduleFoundryPianoNote(input:{
  context:AudioContext;
  destination:AudioNode;
  buffer:AudioBuffer;
  pitch:number;
  velocity:number;
  time:number;
  duration:number;
  selection:{asset_id:string;playback_rate:number;release_sec:number;velocity_min?:number;velocity_max?:number};
  createSource:()=>AudioBufferSourceNode;
}):{asset_id:string;start_time:number;stop_time:number;release_start:number;playback_rate:number;voice_gain:number;attack_sec:number;attack_profile:FoundryPianoAttackProfile;release_curve:'cosine_squared_4';commercial_rights_verified:false};
