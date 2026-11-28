/**
 * One bounded capture budget for PulseGrid's local performed-mix preview.
 * This budget expands beyond a one-chord diagnostic, but is deliberately
 * NOT a whole-song/offline-export quota. Source caps do not change live DSP.
 */
export const FOUNDRY_REVIEW_BUDGET=Object.freeze({
  piano_voices:64,
  synth_voices:64,
  drum_hits:96,
  imported_audio_beds:4,
  combined_sources:224,
  track_buses:8,
  automation_events:1024,
  render_seconds:8,
  sample_rate:48000,
});
export function validateFoundryReviewSourceCounts({piano_voices=0,synth_voices=0,drum_hits=0,imported_audio_beds=0}={}){
  const b=FOUNDRY_REVIEW_BUDGET;
  const entries={piano_voices,synth_voices,drum_hits,imported_audio_beds};
  for(const [kind,count] of Object.entries(entries)){
    if(!Number.isSafeInteger(count)||count<0||count>b[kind])
      return {valid:false,reason:kind+' exceeds bounded local audition source budget',limit:b[kind]};
  }
  const total=piano_voices+synth_voices+drum_hits+imported_audio_beds;
  if(total>b.combined_sources)
    return {valid:false,reason:'Combined sources exceed local audition graph budget',limit:b.combined_sources};
  return {valid:true,source_count:total,source_limits:b};
}
