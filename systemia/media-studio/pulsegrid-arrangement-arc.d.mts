import type {PulseGridSession} from './pulsegrid-session.js';
export type PulseGridArrangementArcBar={
  bar:number;from_step:number;to_step_exclusive:number;
  midi_onsets:number;mean_onset_velocity:number|null;
  sounding_parts:number;muted_sounding_parts:number;
  first_entrances:string[];reentries:string[];departures:string[];
  score_silent:boolean;
};
export type PulseGridArrangementArc={
  schema:'evercraft.fallen.arrangement-arc.v1';scene:number;
  steps_per_bar:number;bar_count:number;pitched_part_count:number;midi_note_count:number;
  bars:PulseGridArrangementArcBar[];peak_midi_onsets:number;peak_onset_bars:number[];
  completely_silent_score_bars:number[];
  first_entrances:{track_id:string;bar:number}[];
  observations:{kind:string;observation:string;listening_prompt:string}[];
  coverage:string;excluded_audio:string;measures_acoustic_loudness:false;
  automatic_composition_changes:false;emotional_quality_score:null;
  human_musician_review_required:true;
};
export function analyzePulseGridArrangementArc(session:PulseGridSession,scene:number):PulseGridArrangementArc;
