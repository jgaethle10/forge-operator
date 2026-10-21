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
    // Vertical simultaneities are not a horizontal melodic line. Group
    // identical note-on steps before describing motion, and conservatively
    // skip intervals adjacent to a chord onset (voice assignment unknown).
    const onsets=[];
    for(const note of notes){
      const last=onsets[onsets.length-1];
      if(last&&last.start===note.start)last.pitches.push(note.pitch);
      else onsets.push({start:note.start,pitches:[note.pitch]});
    }
    const motions=[];
    for(let i=1;i<onsets.length;i++){
      const before=onsets[i-1].pitches,after=onsets[i].pitches;
      motions.push(before.length===1&&after.length===1
        ?after[0]-before[0]:null);
    }
    const leapCount=motions.filter(x=>x!==null&&Math.abs(x)>=7).length;
    const motifPatterns=new Map();
    for(let i=0;i+3<=motions.length;i++){
      const cell=motions.slice(i,i+3);
      if(cell.includes(null))continue;
      const pattern=cell.join(',');
      motifPatterns.set(pattern,(motifPatterns.get(pattern)||0)+1);
    }
    const repetitions=[...motifPatterns.values()].filter(n=>n>1).length;
    // These are measurable silences between the sounding spans on a part.
    // They do not imply a specific phrase, breath mark, meter or interpretation.
    let soundingEnd=null;
    const restGaps=[];
    for(const note of notes){
      if(soundingEnd!==null&&note.start>soundingEnd+.001){
        restGaps.push({start_step:Number(soundingEnd.toFixed(3)),
          duration_steps:Number((note.start-soundingEnd).toFixed(3))});
      }
      soundingEnd=Math.max(soundingEnd??note.end,note.end);
    }
    tracks.push({
      track_id:track.id,note_count:notes.length,
      lowest_midi:Math.min(...notes.map(n=>n.pitch)),
      highest_midi:Math.max(...notes.map(n=>n.pitch)),
      large_melodic_leaps:leapCount,
      melodic_interval_pairs:motions.filter(x=>x!==null).length,
      stacked_onset_groups:onsets.filter(x=>x.pitches.length>1).length,
      repeated_interval_motifs:repetitions,
      rest_gap_count:restGaps.length,
      longest_rest_steps:Number(Math.max(0,...restGaps.map(x=>x.duration_steps)).toFixed(3)),
      rest_gaps:restGaps.slice(0,8),
      velocity_min:Number(Math.min(...notes.map(n=>n.velocity)).toFixed(3)),
      velocity_max:Number(Math.max(...notes.map(n=>n.velocity)).toFixed(3)),
    });
  }
  if(events.length>16384)throw new Error('Music analysis total note budget exceeded');
  const pitchClassWeights=Array(12).fill(0);
  const pitchClassCounts=Array(12).fill(0);
  for(const note of events){
    const pc=note.pitch%12;
    pitchClassCounts[pc]++;
    pitchClassWeights[pc]+=Math.min(16,note.end-note.start)*note.velocity;
  }
  // Canonical evidence is ALWAYS all twelve pitch classes in chromatic order,
  // including absent classes (count 0). Rounding never determines presence.
  // Duration x velocity is a MIDI statistic, not acoustic loudness or a key.
  const pitchClassEvidence=pitchClassWeights.map((weight,pc)=>({
    pitch_class:NAMES[pc],pc,note_count:pitchClassCounts[pc],
    weight:Number(weight.toFixed(3))
  }));
  // Only the compact UI ranking is truncated. Use unrounded weights for
  // sorting so quiet performances survive the evidence representation.
  const prominentPitchClasses=pitchClassEvidence
    .filter(item=>item.note_count>0)
    .sort((a,b)=>pitchClassWeights[b.pc]-pitchClassWeights[a.pc]||a.pc-b.pc)
    .slice(0,5);
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
    kind:'melodic_leaps',observation:'A sequence of distinct single-note onsets leaps at least a perfect fifth.',
    recommendation:'Listen for phrase direction and use approach tones or contrast deliberately.'});
  if(tracks.some(t=>t.repeated_interval_motifs>0))findings.push({
    kind:'motif_repetition',observation:'Repeated three-interval cells appear in a part.',
    recommendation:'Try a musical answer, inversion, rhythmic displacement or registral variation; retain the original motif.'});
  if(events.length>6&&Math.max(...windows.map(x=>x.mean_note_velocity))-
    Math.min(...windows.map(x=>x.mean_note_velocity))<.1)findings.push({
    kind:'limited_velocity_arc',observation:'Average MIDI velocity varies little across quarters.',
    recommendation:'Audition whether the emotional arc benefits from contrast; velocity is not a complete loudness model.'});
  if(tracks.some(t=>t.rest_gap_count>0))findings.push({
    kind:'phrase_space',
    observation:'At least one part contains a measurable rest between note spans.',
    recommendation:'Audition whether each gap creates anticipation, room for another voice, or a phrase breath. The analyzer never inserts notes or silence.'
  });
  // Sweep in note-on order with a heap of note-offs and per-pitch active
  // track counts. Complexity stays bounded for dense orchestration; it does
  // not compare every note against all other notes.
  const collisions=[];
  const active=Array.from({length:128},()=>new Map());
  const heap=[];
  const insert=item=>{
    heap.push(item);
    let i=heap.length-1;
    while(i>0){
      const parent=Math.floor((i-1)/2);
      if(heap[parent].end<=heap[i].end)break;
      [heap[parent],heap[i]]=[heap[i],heap[parent]];
      i=parent;
    }
  };
  const pop=()=>{
    const top=heap[0],last=heap.pop();
    if(heap.length){
      heap[0]=last;
      let i=0;
      while(true){
        const left=i*2+1,right=left+1;
        let smallest=i;
        if(left<heap.length&&heap[left].end<heap[smallest].end)smallest=left;
        if(right<heap.length&&heap[right].end<heap[smallest].end)smallest=right;
        if(smallest===i)break;
        [heap[i],heap[smallest]]=[heap[smallest],heap[i]];
        i=smallest;
      }
    }
    return top;
  };
  for(const note of [...events].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
    while(heap.length&&heap[0].end<=note.start){
      const old=pop(),bucket=active[old.pitch];
      const next=(bucket.get(old.track_id)||0)-1;
      if(next<=0)bucket.delete(old.track_id);
      else bucket.set(old.track_id,next);
    }
    if(collisions.length<12){
      for(let pitch=Math.max(0,note.pitch-2);pitch<=Math.min(127,note.pitch+2);pitch++){
        for(const otherTrack of active[pitch].keys()){
          if(otherTrack===note.track_id)continue;
          collisions.push([otherTrack,note.track_id,pitch,note.pitch]);
          if(collisions.length>=12)break;
        }
        if(collisions.length>=12)break;
      }
    }
    const bucket=active[note.pitch];
    bucket.set(note.track_id,(bucket.get(note.track_id)||0)+1);
    insert(note);
  }
  if(collisions.length)findings.push({
    kind:'register_proximity',observation:'Multiple instrument parts overlap within two semitones in the same register.',
    recommendation:'Listen for masking and decide whether unison reinforcement or spacing is more expressive.'});
  return {
    schema:'evercraft.fallen.music-theory-insights.v1',scene,
    note_count:events.length,pitched_track_count:tracks.length,
    track_profiles:tracks,pitch_class_evidence:pitchClassEvidence,
    prominent_pitch_classes:prominentPitchClasses,
    pitch_class_weighting:'capped_note_duration_steps_times_midi_velocity',
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
