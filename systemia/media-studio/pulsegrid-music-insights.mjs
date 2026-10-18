/**
 * Music theory is useful as a set of observable relationships, not an
 * automatic taste / originality score. This module never edits the score.
 * Canonical PulseGrid MIDI note values remain its entire evidence base.
 */
const NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
export function analyzePulseGridMusic(session,scene){
  if(!session||!Array.isArray(session.tracks)||!Number.isInteger(scene)||
    scene<0||scene>127)throw new Error('Canonical PulseGrid session and scene required');
  const events=[];
  const tracks=[];
  for(const track of session.tracks){
    if(!['synth'].includes(track.type))continue;
    const clip=track.clips?.[scene];
    if(!clip)continue;
    const notes=clip.notes.map(note=>{
      if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
         !Number.isFinite(note.start)||!Number.isFinite(note.length)||note.length<=0||
         !Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1)
        throw new Error('Invalid canonical note for music analysis');
      return {track_id:track.id,pitch:note.pitch,start:note.start,
       end:note.start+note.length,velocity:note.velocity};
    }).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
    if(notes.length>4096)throw new Error('Music analysis note budget exceeded');
    events.push(...notes);
    if(!notes.length)continue;
    const motions=[];
    for(let i=1;i<notes.length;i++)motions.push(notes[i].pitch-notes[i-1].pitch);
    const leapCount=motions.filter(x=>Math.abs(x)>=7).length;
    const motifPatterns=new Map();
    for(let i=0;i+3<=motions.length;i++){
      const pattern=motions.slice(i,i+3).join(',');
      motifPatterns.set(pattern,(motifPatterns.get(pattern)||0)+1);
    }
    const repetitions=[...motifPatterns.values()].filter(n=>n>1).length;
    tracks.push({
      track_id:track.id,note_count:notes.length,
      lowest_midi:Math.min(...notes.map(n=>n.pitch)),
      highest_midi:Math.max(...notes.map(n=>n.pitch)),
      large_melodic_leaps:leapCount,
      repeated_interval_motifs:repetitions,
      velocity_min:Number(Math.min(...notes.map(n=>n.velocity)).toFixed(3)),
      velocity_max:Number(Math.max(...notes.map(n=>n.velocity)).toFixed(3)),
    });
  }
  if(events.length>16384)throw new Error('Music analysis total note budget exceeded');
  const pitchClasses=Array(12).fill(0);
  for(const note of events)pitchClasses[note.pitch%12]+=Math.min(16,note.end-note.start)*note.velocity;
  const ranked=pitchClasses.map((weight,pc)=>({pitch_class:NAMES[pc],pc,weight:+weight.toFixed(3)}))
    .sort((a,b)=>b.weight-a.weight||a.pc-b.pc).slice(0,5);
  const total=events.reduce((s,n)=>s+n.velocity,0);
  const positions=events.length?events.map(n=>n.start):[];
  const end=events.length?Math.max(...events.map(n=>n.end)):0;
  const windows=Array.from({length:4},(_,i)=>{
    const selected=events.filter(n=>n.start>=end*i/4&&
      (i===3||n.start<end*(i+1)/4));
    const average=selected.reduce((s,n)=>s+n.velocity,0)/Math.max(1,selected.length);
    return {quarter:i+1,note_count:selected.length,
      mean_note_velocity:Number(average.toFixed(3))};
  });
  const findings=[];
  if(!events.length)findings.push({
    kind:'empty_arrangement',observation:'No pitched MIDI notes in this scene.',
    recommendation:'Add or import a musical phrase before tonal or expressive analysis.'});
  if(tracks.some(t=>t.large_melodic_leaps>0))findings.push({
    kind:'melodic_leaps',observation:'One or more parts leap at least a perfect fifth.',
    recommendation:'Listen for phrase direction and use approach tones or contrast deliberately.'});
  if(tracks.some(t=>t.repeated_interval_motifs>0))findings.push({
    kind:'motif_repetition',observation:'Repeated three-interval cells appear in a part.',
    recommendation:'Try a musical answer, inversion, rhythmic displacement or registral variation; retain the original motif.'});
  if(events.length>6&&Math.max(...windows.map(x=>x.mean_note_velocity))-
    Math.min(...windows.map(x=>x.mean_note_velocity))<.1)findings.push({
    kind:'limited_velocity_arc',observation:'Average MIDI velocity varies little across quarters.',
    recommendation:'Audition whether the emotional arc benefits from contrast; velocity is not a complete loudness model.'});
  const collisions=[];
  for(let i=0;i<events.length;i++){
    for(let j=i+1;j<events.length;j++){
      if(events[i].track_id===events[j].track_id)continue;
      if(Math.abs(events[i].pitch-events[j].pitch)>2)continue;
      if(Math.min(events[i].end,events[j].end)<=Math.max(events[i].start,events[j].start))continue;
      collisions.push([events[i].track_id,events[j].track_id,events[i].pitch,events[j].pitch]);
      if(collisions.length>=12)break;
    }
    if(collisions.length>=12)break;
  }
  if(collisions.length)findings.push({
    kind:'register_proximity',observation:'Multiple instrument parts overlap within two semitones in the same register.',
    recommendation:'Listen for masking and decide whether unison reinforcement or spacing is more expressive.'});
  return {
    schema:'evercraft.fallen.music-theory-insights.v1',scene,
    note_count:events.length,pitched_track_count:tracks.length,
    track_profiles:tracks,pitch_class_evidence:ranked,
    velocity_arc:windows,
    register_proximity_examples:collisions.length,
    findings,
    inferred_key:null,
    inferred_chord_progression:null,
    automatic_composition_changes:false,
    taste_or_originality_score:null,
    reviewer:'human_musician_required'
  };
}
