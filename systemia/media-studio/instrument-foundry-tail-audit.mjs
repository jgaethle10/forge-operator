/**
 * Score-to-recorded-piano tail budget. These are estimates from CANONICAL
 * asset DURATION METADATA, not proof that decoded Web Audio can play the
 * requested phrase, that an instrument sounds acoustic, or that rights clear.
 * Runtime decoded AudioBuffer duration remains the independent ground truth.
 */
import {selectFoundrySample,validateFoundryPatch} from './instrument-foundry-piano.mjs';
import {foundryPedalDurationSteps} from './instrument-foundry-pedal.mjs';
import {pulseGridNoteDurationSeconds} from './pulsegrid-note-duration.mjs';

const round=x=>Math.round(x*1000)/1000;
export function foundryPianoSampleTailBudget({
  sample_duration_sec,playback_rate,held_seconds,release_sec
}={}){
  if(![sample_duration_sec,playback_rate,held_seconds,release_sec]
    .every(x=>Number.isFinite(x)&&x>0)||
    release_sec>1.5||sample_duration_sec>300||held_seconds>600||
    playback_rate<0.5||playback_rate>2)
    throw new Error('Invalid recorded piano sample tail budget');
  const available=sample_duration_sec/playback_rate;
  const desired=held_seconds+release_sec;
  return {
    available_seconds:round(available),
    key_held_seconds:round(held_seconds),
    target_seconds:round(desired),
    key_hold_shortfall_seconds:round(Math.max(0,held_seconds-available)),
    tail_shortfall_seconds:round(Math.max(0,desired-available)),
    classification:available<held_seconds-1e-6
      ? 'key_hold_shortfall'
      : available<desired-1e-6
        ? 'release_tail_shortfall':'sufficient_metadata_duration',
  };
}

/** Only authored pitched MIDI using Foundry recorded patches is assessed.
 * Muted/solo/probabilistic score entries stay included, never implied audible.
 */
export function analyzeFoundryPianoTailCoverage(session,scene=0){
  if(!session||!Array.isArray(session.tracks)||!Array.isArray(session.assets)||
     !Number.isInteger(scene)||scene<0||
     !Number.isFinite(session.transport?.bpm)||
     !Number.isFinite(session.transport?.swing))
    throw new Error('Invalid canonical piano tail audit input');
  const assets=new Map(session.assets.map(a=>[a.id,a]));
  const findings=[];
  let mapped=0,unmapped=0,shortKeys=0,shortTails=0,total=0,unknownRights=0;
  for(const track of session.tracks){
    if(track.type!=='synth')continue;
    const clip=track.clips?.[scene],patch=clip?.provenance?.foundry_piano_patch;
    if(!patch)continue;
    validateFoundryPatch(patch,session.assets);
    const pedal=clip.provenance?.foundry_piano_pedal??[];
    for(const note of clip.notes||[]){
      total++;
      let sel;
      try{sel=selectFoundrySample(patch,note.pitch,note.velocity)}
      catch{
        unmapped++;
        findings.push({kind:'sample_unmapped',track_id:track.id,pitch:note.pitch,
          start_step:note.start,asset_id:null,shortfall_seconds:null,
          note:'No real recorded sample mapped to this score note and dynamic.'});
        continue;
      }
      mapped++;
      const asset=assets.get(sel.asset_id);
      if(asset.rights==='unknown')unknownRights++;
      const heldSteps=foundryPedalDurationSteps({events:pedal,
        start_step:note.start,length_steps:note.length,clip_steps:clip.steps.length});
      const seconds=pulseGridNoteDurationSeconds({bpm:session.transport.bpm,
        swing:session.transport.swing,start_step:note.start,length_steps:heldSteps});
      const budget=foundryPianoSampleTailBudget({
        sample_duration_sec:asset.duration_sec,playback_rate:sel.playback_rate,
        held_seconds:seconds,release_sec:sel.release_sec,
      });
      if(budget.classification==='key_hold_shortfall')shortKeys++;
      if(budget.classification==='release_tail_shortfall')shortTails++;
      if(budget.classification!=='sufficient_metadata_duration'){
        findings.push({kind:budget.classification,track_id:track.id,
          pitch:note.pitch,start_step:note.start,asset_id:sel.asset_id,
          shortfall_seconds:budget.classification==='key_hold_shortfall'
            ? budget.key_hold_shortfall_seconds:budget.tail_shortfall_seconds,
          note:budget.classification==='key_hold_shortfall'
            ? 'Estimated recording ends before written key/pedal hold.'
            : 'Estimated recording ends before complete sampler release tail.'});
      }
    }
  }
  const severity={sample_unmapped:0,key_hold_shortfall:1,release_tail_shortfall:2};
  findings.sort((a,b)=>severity[a.kind]-severity[b.kind]||
    (b.shortfall_seconds??0)-(a.shortfall_seconds??0)||
    a.track_id.localeCompare(b.track_id)||a.start_step-b.start_step||a.pitch-b.pitch);
  return {
    evidence:'canonical_asset_duration_metadata_only',
    scene,authored_notes:total,mapped_notes:mapped,unmapped_notes:unmapped,
    key_hold_shortfalls:shortKeys,release_tail_shortfalls:shortTails,
    unknown_rights_note_uses:unknownRights,
    total_findings:findings.length,
    findings:findings.slice(0,24),
    limitations:'Not verified decoded WAV length, RMS/acoustic decay, release sound, instrument quality or rights clearance; silent/muted/probabilistic notes are also included.',
  };
}
