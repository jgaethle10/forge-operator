export type FoundryOfflineBusTrack={
 id:string;volume:number;filterHz:number;delayMix:number;
 delayTime:number;delayFeedback:number;autoVolume:number;autoFilter:number;
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
 audio_beds_within_window?:boolean;analyzed_audio_beds?:number;
 source_kind:'decoded_pcm_only';limitations?:string;
};
export function renderFoundryPianoOfflineBus(input:{
 voices:FoundryOfflineBusVoice[];tracks:FoundryOfflineBusTrack[];
 audioBeds?:FoundryOfflineAudioBed[];
 offlineContextFactory?:(channels:number,frames:number,rate:number)=>OfflineAudioContext;
}):Promise<FoundryOfflineBusResult>;
