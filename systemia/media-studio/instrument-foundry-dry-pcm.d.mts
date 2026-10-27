export type FoundryDryPcmVoice={
 buffer:AudioBuffer;start_time:number;stop_time:number;release_start:number;
 attack_sec:number;voice_gain:number;playback_rate:number;source_offset_sec:number;
};
export type FoundryDryPcmAudit={
 status:'measured_offline_dry_approximation'|'unavailable';
 scope:'decoded_sampled_piano_dry_approximation';
 sample_peak:number|null;peak_dbfs:number|null;
 over_full_scale_frames:number|null;examined_frames:number;
 analyzed_voices:number;complete:boolean;
 rms_dbfs?:number;window_sec?:number;rate?:number;reason?:string;limitations?:string;
};
export function analyzeFoundryDecodedPianoDryPeak(input:{
 voices:FoundryDryPcmVoice[];rate?:12000|24000|48000;window_sec?:number;
}):FoundryDryPcmAudit;
