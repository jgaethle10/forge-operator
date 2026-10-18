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

export type FoundryRootPitchEvidence={
 schema:'evercraft.fallen.piano-root-evidence.v1';
 status:'consistent'|'mismatch'|'indeterminate';
 expected_midi:number;expected_hz:number;
 estimated_hz:number|null;cents_error:number|null;
 periodicity:number;reason:string;human_pitch_confirmed:false;
};
export function checkFoundryPianoRootPitch(input:Uint8Array|ArrayBuffer,expectedMidi:number):FoundryRootPitchEvidence;
