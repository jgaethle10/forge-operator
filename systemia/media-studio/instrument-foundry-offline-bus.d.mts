export type FoundryOfflineBusTrack={
 id:string;volume:number;filterHz:number;delayMix:number;
 delayTime:number;delayFeedback:number;autoVolume:number;autoFilter:number;
};
export type FoundryOfflineDrumHit={
 track_id:string;kind:'kick'|'hat';time:number;velocity:number;
 stop_time:number;noiseBuffer:AudioBuffer|null;
};
export type FoundryOfflineSynthVoice={
 track_id:string;pitch:number;velocity:number;start_time:number;
 duration:number;stop_time:number;
};
export type FoundryOfflineAudioBed={
 track_id:string;buffer:AudioBuffer;start_time:number;duration:number;
 mode:'loop'|'one_shot';
};
export type FoundryOfflineBusVoice={
 track_id:string;buffer:AudioBuffer;pitch:number;velocity:number;
 start_time:number;stop_time:number;duration:number;
 selection:{asset_id:string;playback_rate:number;release_sec:number;
   velocity_min?:number;velocity_max?:number};
};
export type FoundryOfflineBusResult={
 status:'unavailable'|'offline_track_bus_pcm_measurement';
 scope:'offline_sampled_piano_track_bus_approximation';
 reason?:string;peak_dbfs:number|null;sample_peak:number|null;
 over_full_scale_frames:number|null;complete:boolean;source_notes_within_window?:boolean;effects_tail_complete?:boolean;analyzed_voices:number;
 rms_dbfs?:number;rendered_frames?:number;window_sec?:number;rate?:number;
 audition_origin_time?:number;performed_step_count?:number;
 performance_gap_count?:number;first_gap_at_sec?:number|null;
 performance_evidence?:'observed_scheduled_steps_only';
 audio_beds_within_window?:boolean;analyzed_audio_beds?:number;
 analyzed_synth_voices?:number;analyzed_drum_hits?:number;
 reviewed_source_count?:number;render_source_limit?:number;
 performed_bus_automation_events?:number;performed_bus_automation_applied?:boolean;
 later_bus_automation_excluded?:number;performance_coverage_sec?:number;
 performance_window_complete?:boolean;
 audition_wav_bytes?:Uint8Array;audition_sample_clamped?:boolean;
 included_track_ids?:string[];omitted_track_ids?:string[];
 source_kind:'decoded_pcm_only'|'decoded_pcm_plus_synth';limitations?:string;
};
export function renderFoundryPianoOfflineBus(input:{
 voices:FoundryOfflineBusVoice[];tracks:FoundryOfflineBusTrack[];
 audioBeds?:FoundryOfflineAudioBed[];synthVoices?:FoundryOfflineSynthVoice[];
 drumVoices?:FoundryOfflineDrumHit[];
 window_sec?:0.8|8;includeAuditionWav?:boolean;
 automationEvents?:import('./pulsegrid-bus-automation.mjs').PulseGridCapturedBusStep[];
 offlineContextFactory?:(channels:number,frames:number,rate:number)=>OfflineAudioContext;
}):Promise<FoundryOfflineBusResult>;
