export type FoundryPianoPolyphonyObservation={
 evidence:'scheduled_sampled_voices_not_measured_audio';
 observed_voices:number;excluded_voices:number;max_simultaneous_voices:number;
 peak_summed_voice_gain:number;review_gain_summation:boolean;
 observation_complete:boolean;caution:string;
};
export class FoundryPianoPolyphonyLedger{
 constructor(limit?:number);
 reset():void;
 record(input:{track_id:string;start_time:number;stop_time:number;voice_gain:number}):void;
 snapshot():FoundryPianoPolyphonyObservation;
}
