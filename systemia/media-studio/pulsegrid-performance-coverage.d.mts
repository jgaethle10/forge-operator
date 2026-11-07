export type PulseGridPerformedTransportStep={
 step:number;loop_steps:number;time:number;duration:number;
};
export type PulseGridStepCoverage={
 status:'unavailable'|'verified_scheduled_step_contiguity';
 reason?:string;performance_coverage_sec:number;
 performance_window_complete:boolean;performed_step_count:number;
 performance_gap_count:number;first_gap_at_sec:number|null;
 evidence:'observed_scheduled_steps_only';caution?:string;
};
export function inspectPulseGridPerformedStepCoverage(input:{
 events:PulseGridPerformedTransportStep[];origin:number;window_sec:0.8|8;
}):PulseGridStepCoverage;
