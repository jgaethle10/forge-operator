export type MusicInsightFinding={kind:string;observation:string;recommendation:string};
export type PulseGridMusicInsights={
 schema:'evercraft.fallen.music-theory-insights.v1';
 scene:number;note_count:number;pitched_track_count:number;
 track_profiles:Array<{track_id:string;note_count:number;lowest_midi:number;highest_midi:number;
 large_melodic_leaps:number;repeated_interval_motifs:number;velocity_min:number;velocity_max:number}>;
 pitch_class_evidence:Array<{pitch_class:string;pc:number;weight:number}>;
 velocity_arc:Array<{quarter:number;note_count:number;mean_note_velocity:number}>;
 register_proximity_examples:number;findings:MusicInsightFinding[];
 inferred_key:null;inferred_chord_progression:null;
 automatic_composition_changes:false;taste_or_originality_score:null;
 reviewer:'human_musician_required';
};
export function analyzePulseGridMusic(session:unknown,scene:number):PulseGridMusicInsights;
