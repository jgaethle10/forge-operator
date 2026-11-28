export type PulseGridCapturedBusStep={
 track_id:string;time:number;autoVolume:number;autoFilter:number;
 trackVolume:number;trackFilterHz:number;
};
export type PulseGridOfflineAutomationEvent={
 track_id:string;relative_time:number;volume:number;frequency_hz:number;initial:boolean;
};
export function planPulseGridBusAutomation(input:{
 events:PulseGridCapturedBusStep[];
 tracks:Array<{id:string;volume:number;filterHz:number}>;
 origin:number;window_sec:0.8|8;
}):{
 automation_events:PulseGridOfflineAutomationEvent[];
 recorded_events_in_window:number;
 later_recorded_events_excluded:number;
 track_count:number;
 evidence:'original_scheduled_track_step_automation';
};
