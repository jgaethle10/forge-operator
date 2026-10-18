export type CounterpointMotionSummary={
 contrary:number;oblique:number;similar:number;parallel_fifths:number;
 parallel_octaves_or_unisons:number;
};
export type CounterpointEvidence={
 schema:'evercraft.fallen.counterpoint-evidence.v1';
 scene:number;analyzed_synth_tracks:number;analyzed_track_pairs:number;
 simultaneous_single_note_onsets:number;
 motion_summary:CounterpointMotionSummary;
 interval_class_histogram:number[];
 pair_summaries:Array<{
  track_a:string;track_b:string;synchronized_single_note_onsets:number;
  parallel_fifths:number;parallel_octaves_or_unisons:number;
  contrary_motion:number;oblique_motion:number;similar_motion:number;
 }>;
 bounded_examples:Array<{
  kind:string;track_a:string;track_b:string;
  from_step:number;to_step:number;before:[number,number];after:[number,number];
  context:'synchronized_single_note_onsets_only';
 }>;
 findings:Array<{kind:string;observation:string;recommendation:string}>;
 editorial_rules:'observational_not_prescriptive';
 automatic_note_changes:false;inferred_key:null;
 real_audio_masking_measured:false;human_musician_review_required:true;
};
export function analyzePulseGridCounterpoint(session:unknown,scene:number):CounterpointEvidence;
