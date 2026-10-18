export type MusicInsightFinding={kind:string;observation:string;recommendation:string};
export type PulseGridMusicInsights={
 schema:'evercraft.fallen.music-theory-insights.v1';
 scene:number;note_count:number;pitched_track_count:number;
 track_profiles:Array<{track_id:string;note_count:number;lowest_midi:number;highest_midi:number;
 large_melodic_leaps:number;melodic_interval_pairs:number;stacked_onset_groups:number;
 repeated_interval_motifs:number;rest_gap_count:number;longest_rest_steps:number;
 rest_gaps:Array<{start_step:number;duration_steps:number}>;velocity_min:number;velocity_max:number}>;
 pitch_class_evidence:Array<{pitch_class:string;pc:number;note_count:number;weight:number}>;
 prominent_pitch_classes:Array<{pitch_class:string;pc:number;note_count:number;weight:number}>;
 pitch_class_weighting:'capped_note_duration_steps_times_midi_velocity';
 velocity_arc:Array<{quarter:number;note_count:number;mean_note_velocity:number}>;
 register_proximity_examples:number;findings:MusicInsightFinding[];
 inferred_key:null;inferred_chord_progression:null;
 automatic_composition_changes:false;taste_or_originality_score:null;
 reviewer:'human_musician_required';
};
export function analyzePulseGridMusic(session:unknown,scene:number):PulseGridMusicInsights;
