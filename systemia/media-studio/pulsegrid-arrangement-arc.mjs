/**
 * Read-only arrangement evidence from canonical Fallen Sessions/PulseGrid MIDI.
 * A score inspection aid, not an acoustic loudness measurement, listening
 * verdict, emotion score, composition edit or commercial release decision.
 */
const STEPS_PER_BAR=16,MAX_BARS=16,MAX_TRACKS=32;
const MAX_NOTES_PER_TRACK=4096,MAX_NOTES=16384;
export function analyzePulseGridArrangementArc(session,scene){
  if(!session||!Array.isArray(session.tracks)||!Number.isInteger(scene)||scene<0||scene>127)
    throw new Error('Canonical PulseGrid session and valid scene required');
  if(session.tracks.length>MAX_TRACKS)throw new Error('Arrangement arc track budget exceeded');
  const parts=[];
  let noteCount=0,barCount=1;
  for(const track of session.tracks){
    if(track.type!=='synth')continue;
    const clip=track.clips?.[scene];
    if(!clip)continue;
    if(!Number.isInteger(clip.bars)||clip.bars<1||clip.bars>MAX_BARS||
       clip.steps_per_bar!==STEPS_PER_BAR||!Array.isArray(clip.notes))
      throw new Error('Invalid canonical MIDI clip for arrangement arc');
    if(clip.notes.length>MAX_NOTES_PER_TRACK)
      throw new Error('Arrangement arc MIDI note budget exceeded');
    barCount=Math.max(barCount,clip.bars);
    const notes=clip.notes.map(note=>{
      if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
         !Number.isFinite(note.start)||note.start<0||!Number.isFinite(note.length)||
         note.length<=0||note.start>=clip.bars*STEPS_PER_BAR||
         !Number.isFinite(note.start+note.length)||
         !Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1)
        throw new Error('Invalid canonical MIDI note for arrangement arc');
      return {start:note.start,end:note.start+note.length,velocity:note.velocity};
    });
    noteCount+=notes.length;
    if(noteCount>MAX_NOTES)throw new Error('Arrangement arc total note budget exceeded');
    parts.push({id:track.id,notes,muted:Boolean(track.muted)});
  }
  const firstSeen=new Set();
  let previousSounding=new Set();
  const bars=[];
  for(let index=0;index<barCount;index++){
    const start=index*STEPS_PER_BAR,end=start+STEPS_PER_BAR;
    const sounding=new Set(),first_entrances=[],reentries=[];
    let onsets=0,velocitySum=0,mutedParts=0;
    for(const part of parts){
      const active=part.notes.some(note=>note.start<end&&note.end>start);
      if(active){
        sounding.add(part.id);
        if(part.muted)mutedParts++;
      }
      for(const note of part.notes){
        if(note.start>=start&&note.start<end){
          onsets++;
          velocitySum+=note.velocity;
        }
      }
      if(active&&!previousSounding.has(part.id)){
        if(firstSeen.has(part.id))reentries.push(part.id);
        else first_entrances.push(part.id);
      }
    }
    const departures=[...previousSounding].filter(id=>!sounding.has(id));
    for(const id of sounding)firstSeen.add(id);
    bars.push({
      bar:index+1,from_step:start,to_step_exclusive:end,
      midi_onsets:onsets,
      mean_onset_velocity:onsets?Number((velocitySum/onsets).toFixed(3)):null,
      sounding_parts:sounding.size,muted_sounding_parts:mutedParts,
      first_entrances,reentries,departures,
      score_silent:sounding.size===0
    });
    previousSounding=sounding;
  }
  const maxOnsets=Math.max(0,...bars.map(b=>b.midi_onsets));
  const peakBars=maxOnsets?bars.filter(b=>b.midi_onsets===maxOnsets).map(b=>b.bar):[];
  const silentBars=bars.filter(b=>b.score_silent).map(b=>b.bar);
  const firstEntrances=bars.flatMap(b=>b.first_entrances.map(id=>({track_id:id,bar:b.bar})));
  const observations=[];
  if(silentBars.length)observations.push({kind:'score_silence',
    observation:'No pitched MIDI note sustains through bar'+(silentBars.length===1?' ':'s ')+silentBars.join(', ')+'.',
    listening_prompt:'Hear whether that space is deliberate. Audio takes, drums and effect tails are not measured.'});
  if(firstEntrances.some(e=>e.bar>1))observations.push({kind:'layer_arrival',
    observation:'One or more pitched parts enter after the first bar.',
    listening_prompt:'Listen for how each new voice changes the orchestration rather than assuming more parts means more emotion.'});
  if(maxOnsets>0&&bars.some(b=>b.midi_onsets>0&&b.midi_onsets<maxOnsets))
    observations.push({kind:'onset_density_contrast',
      observation:'Written MIDI note-on density changes across bars.',
      listening_prompt:'Compare rhythm and phrasing; note count is not loudness, intensity or musical quality.'});
  return {
    schema:'evercraft.fallen.arrangement-arc.v1',scene,
    steps_per_bar:STEPS_PER_BAR,bar_count:barCount,
    pitched_part_count:parts.length,midi_note_count:noteCount,
    bars,peak_midi_onsets:maxOnsets,peak_onset_bars:peakBars,
    completely_silent_score_bars:silentBars,first_entrances:firstEntrances,
    observations,
    coverage:'written_synth_midi_including_muted_and_probabilistic_notes',
    excluded_audio:'drums_audio_clips_reverb_delay_resonance_not_measured',
    measures_acoustic_loudness:false,automatic_composition_changes:false,
    emotional_quality_score:null,human_musician_review_required:true
  };
}
