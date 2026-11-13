export const FOUNDRY_REVIEW_BUDGET:Readonly<{
 piano_voices:64;synth_voices:64;drum_hits:96;imported_audio_beds:4;
 combined_sources:224;track_buses:8;automation_events:1024;
 render_seconds:8;sample_rate:48000;
}>;
export function validateFoundryReviewSourceCounts(input?:{
 piano_voices?:number;synth_voices?:number;drum_hits?:number;
 imported_audio_beds?:number;
}):{valid:true;source_count:number;source_limits:typeof FOUNDRY_REVIEW_BUDGET}|
  {valid:false;reason:string;limit:number};
