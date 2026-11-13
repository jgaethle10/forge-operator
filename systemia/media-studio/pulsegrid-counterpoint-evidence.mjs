/**
 * Non-destructive two-part counterpoint evidence from canonical PulseGrid MIDI.
 *
 * Strictly describes paired SYNCHRONOUS singleton note onsets. Chords and
 * independent/asynchronous onsets are not assigned invented voice identities.
 * Classical parallel perfect intervals are OBSERVATIONS, not automatic errors.
 */
const MAX_TRACKS=24,MAX_NOTES_PER_TRACK=4096,MAX_EXAMPLES=16;
const EPS=1e-6;
const pcInterval=(a,b)=>Math.abs(b-a)%12;
function onsetsFor(track,scene){
  const clip=track.clips?.[scene];
  if(!clip)return [];
  const notes=clip.notes||[];
  if(!Array.isArray(notes)||notes.length>MAX_NOTES_PER_TRACK)
    throw new Error('Counterpoint MIDI note budget exceeded');
  const sorted=notes.map(n=>{
    if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
       !Number.isFinite(n.start)||n.start<0||
       !Number.isFinite(n.length)||n.length<=0)
      throw new Error('Invalid canonical MIDI note in counterpoint evidence');
    return {pitch:n.pitch,start:n.start,end:n.start+n.length};
  }).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  const points=[];
  for(const n of sorted){
    const last=points.at(-1);
    if(last&&last.start===n.start)last.notes.push(n);
    else points.push({start:n.start,notes:[n]});
  }
  let activeUntil=-Infinity;
  for(const point of points){
    // Another note in the same track still sounding at this onset means we
    // cannot claim this is a uniquely assigned monophonic voice.
    point.overlap_at_onset=activeUntil>point.start+EPS;
    for(const note of point.notes)activeUntil=Math.max(activeUntil,note.end);
  }
  return points;
}
function coOnsets(a,b){
  let i=0,j=0;
  const pairs=[];
  while(i<a.length&&j<b.length){
    const dt=a[i].start-b[j].start;
    if(Math.abs(dt)<=EPS){
      // Multiple pitches at an onset (chords) cannot be treated as a single voice.
      if(a[i].notes.length===1&&b[j].notes.length===1&&
         !a[i].overlap_at_onset&&!b[j].overlap_at_onset){
        pairs.push({start:a[i].start,a:a[i].notes[0].pitch,b:b[j].notes[0].pitch,
          index_a:i,index_b:j});
      }
      i++;j++;
    }else if(dt<0)i++;else j++;
  }
  return pairs;
}
export function analyzePulseGridCounterpoint(session,scene){
  if(!session||!Array.isArray(session.tracks)||!Number.isInteger(scene)||scene<0||scene>127)
    throw new Error('Canonical PulseGrid session and valid scene required');
  const tracks=session.tracks.filter(t=>t.type==='synth');
  if(tracks.length>MAX_TRACKS)throw new Error('Counterpoint track budget exceeded');
  const byTrack=tracks.map(track=>({id:track.id,points:onsetsFor(track,scene)}));
  const examples=[],pairSummaries=[];
  let totalParallelFifths=0,totalParallelOctaves=0;
  let totalContrary=0,totalOblique=0,totalSimilar=0;
  let sharedOnsets=0;
  const intervalHistogram=Array(12).fill(0);
  for(let i=0;i<byTrack.length;i++)for(let j=i+1;j<byTrack.length;j++){
    const upper=byTrack[i],lower=byTrack[j];
    const together=coOnsets(upper.points,lower.points);
    let parallelFifths=0,parallelOctaves=0,contrary=0,oblique=0,similar=0;
    for(const p of together)intervalHistogram[pcInterval(p.a,p.b)]++;
    sharedOnsets+=together.length;
    for(let k=1;k<together.length;k++){
      const previous=together[k-1],current=together[k];
      // Shared onsets separated by an intervening independent onset do not
      // establish two aligned successive voice-leading events.
      if(current.index_a!==previous.index_a+1||current.index_b!==previous.index_b+1)continue;
      const moveA=current.a-previous.a,moveB=current.b-previous.b;
      if(!moveA&&!moveB)continue;
      const movingSame=(moveA>0&&moveB>0)||(moveA<0&&moveB<0);
      const movingOpposite=(moveA>0&&moveB<0)||(moveA<0&&moveB>0);
      if(movingOpposite)contrary++;
      else if(moveA===0||moveB===0)oblique++;
      else if(movingSame)similar++;
      const from=pcInterval(previous.a,previous.b),to=pcInterval(current.a,current.b);
      let kind=null;
      if(movingSame&&from===7&&to===7){parallelFifths++;kind='parallel_perfect_fifths'}
      if(movingSame&&from===0&&to===0){parallelOctaves++;kind='parallel_octaves_or_unisons'}
      if(kind&&examples.length<MAX_EXAMPLES){
        examples.push({
          kind,track_a:upper.id,track_b:lower.id,
          from_step:previous.start,to_step:current.start,
          before:[previous.a,previous.b],after:[current.a,current.b],
          context:'synchronized_single_note_onsets_only'
        });
      }
    }
    if(together.length){
      pairSummaries.push({track_a:upper.id,track_b:lower.id,
        synchronized_single_note_onsets:together.length,
        parallel_fifths:parallelFifths,parallel_octaves_or_unisons:parallelOctaves,
        contrary_motion:contrary,oblique_motion:oblique,similar_motion:similar});
    }
    totalParallelFifths+=parallelFifths;totalParallelOctaves+=parallelOctaves;
    totalContrary+=contrary;totalOblique+=oblique;totalSimilar+=similar;
  }
  const findings=[];
  if(totalParallelFifths||totalParallelOctaves){
    findings.push({
      kind:'parallel_perfect_intervals',
      observation:'Synchronized single-note parts repeat a perfect fifth or octave while moving in the same direction.',
      recommendation:'In strict counterpoint this deserves attention; in cinematic unisons, doubling, popular music or deliberate orchestration it may be exactly right. Listen before changing anything.'
    });
  }
  if(totalContrary){
    findings.push({
      kind:'contrary_voice_motion',
      observation:'Two synchronized pitched parts move in opposing directions.',
      recommendation:'Audition whether the voices remain distinct and whether their register separation carries the intended expression.'
    });
  }
  if(!sharedOnsets){
    findings.push({
      kind:'no_unambiguous_counterpoint',
      observation:'No two separate pitched tracks share unambiguous single-note onsets.',
      recommendation:'This analyzer does not invent voice identities inside chords, arpeggios or unsynchronized parts. Inspect score notation or add explicit voice assignments.'
    });
  }
  return {
    schema:'evercraft.fallen.counterpoint-evidence.v1',
    scene,
    analyzed_synth_tracks:tracks.length,
    analyzed_track_pairs:pairSummaries.length,
    simultaneous_single_note_onsets:sharedOnsets,
    motion_summary:{contrary:totalContrary,oblique:totalOblique,similar:totalSimilar,
      parallel_fifths:totalParallelFifths,parallel_octaves_or_unisons:totalParallelOctaves},
    interval_class_histogram:intervalHistogram,
    pair_summaries:pairSummaries,
    bounded_examples:examples,
    findings,
    editorial_rules:'observational_not_prescriptive',
    automatic_note_changes:false,
    inferred_key:null,
    real_audio_masking_measured:false,
    human_musician_review_required:true
  };
}
