/**
 * Replays ONLY bus automation steps actually scheduled in PulseGrid's live
 * engine, with the same setValueAtTime gain/filter values. No synthetic
 * or unscheduled timeline is silently interpolated.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function planPulseGridBusAutomation({events,tracks,origin,window_sec}={}){
  if(!Array.isArray(events)||events.length===0||events.length>1024||
     !Array.isArray(tracks)||tracks.length===0||tracks.length>8||
     !Number.isFinite(origin)||origin<0||![.8,8].includes(window_sec))
    throw new Error('Invalid bounded PulseGrid automation evidence');
  const byTrack=new Map(tracks.map(t=>[t.id,[]]));
  if(byTrack.size!==tracks.length)throw new Error('Ambiguous automation bus IDs');
  for(const e of events){
    if(!e||!byTrack.has(e.track_id)||!Number.isFinite(e.time)||e.time<0||
       !Number.isFinite(e.autoVolume)||e.autoVolume<0||e.autoVolume>4||
       !Number.isFinite(e.autoFilter)||e.autoFilter<0||e.autoFilter>4||
       !Number.isFinite(e.trackVolume)||e.trackVolume<0||e.trackVolume>4||
       !Number.isFinite(e.trackFilterHz)||e.trackFilterHz<20||e.trackFilterHz>22000)
      throw new Error('Invalid actual PulseGrid track automation event');
    byTrack.get(e.track_id).push(e);
  }
  const out=[];
  let included=0,excluded=0;
  for(const t of tracks){
    const list=byTrack.get(t.id).sort((a,b)=>a.time-b.time);
    if(!list.length)throw new Error('Missing performed automation for included track '+t.id);
    // A session edit after Play must never reinterpret captured mix settings.
    if(list.some(e=>e.trackVolume!==t.volume||e.trackFilterHz!==t.filterHz))
      throw new Error('Track base mix settings changed after recorded performance');
    const calc=e=>({
      track_id:e.track_id,
      relative_time:Math.max(0,e.time-origin),
      volume:Math.max(0,t.volume*e.autoVolume),
      frequency_hz:clamp(t.filterHz*Math.max(.08,e.autoFilter),80,19000)
    });
    const lastAtOrBefore=list.filter(e=>e.time<=origin).at(-1);
    const first=lastAtOrBefore||list[0];
    out.push({...calc(first),relative_time:0,initial:true});
    for(const e of list){
      if(e.time<origin||e.time>origin+window_sec) {
        if(e.time>origin+window_sec)excluded++;
        continue;
      }
      out.push({...calc(e),initial:false});
      included++;
    }
  }
  return {
    automation_events:out,
    recorded_events_in_window:included,
    later_recorded_events_excluded:excluded,
    track_count:tracks.length,
    evidence:'original_scheduled_track_step_automation',
  };
}
