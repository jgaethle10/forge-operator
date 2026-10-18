export type FoundryPianoCaptureQa={
 schema:'evercraft.fallen.piano-capture-technical-qa.v1';
 status:'held'|'technical_signal_pass';
 blockers:string[];
 metrics:{
  sample_rate:number;channels:number;bit_depth:number;codec:number;
  duration_sec:number;peak_dbfs:number;rms_dbfs:number;tail_rms_dbfs:number;
  dc_offset:number;clipped_sample_count:number;samples_examined:number;
 };
 musical_quality_approved:false;
 actual_note_pitch_verified:false;
 performer_rights_verified:false;
 commercial_release_ready:false;
};
export function analyzeFoundryPianoWav(input:Uint8Array|ArrayBuffer):FoundryPianoCaptureQa;
