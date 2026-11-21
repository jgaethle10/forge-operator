export type FoundryTailBudget={
  available_seconds:number;
  key_held_seconds:number;
  target_seconds:number;
  key_hold_shortfall_seconds:number;
  tail_shortfall_seconds:number;
  classification:'key_hold_shortfall'|'release_tail_shortfall'|'sufficient_metadata_duration';
};
export type FoundryTailFinding={
  kind:'sample_unmapped'|'key_hold_shortfall'|'release_tail_shortfall';
  track_id:string;
  pitch:number;
  start_step:number;
  asset_id:string|null;
  shortfall_seconds:number|null;
  note:string;
};
export type FoundryTailCoverage={
  evidence:'canonical_asset_duration_metadata_only';
  scene:number;
  authored_notes:number;
  mapped_notes:number;
  unmapped_notes:number;
  key_hold_shortfalls:number;
  release_tail_shortfalls:number;
  unknown_rights_note_uses:number;
  total_findings:number;
  findings:FoundryTailFinding[];
  limitations:string;
};
export function foundryPianoSampleTailBudget(args:{
  sample_duration_sec:number;playback_rate:number;
  held_seconds:number;release_sec:number;
}):FoundryTailBudget;
export function analyzeFoundryPianoTailCoverage(
  session:unknown,scene?:number
):FoundryTailCoverage;
