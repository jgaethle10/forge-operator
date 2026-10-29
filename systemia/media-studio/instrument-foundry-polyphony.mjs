/**
 * Bounded, read-only performance-voice overlap evidence.
 *
 * Counts actual scheduled sampled MIDI voices, not authored score notes.
 * Potential gain summation is a conservative pre-effect scalar proxy only:
 * it is NOT measured audio peak, loudness, clipping, or a mastering decision.
 * No audio parameters or source content are modified here.
 */
export class FoundryPianoPolyphonyLedger{
  constructor(limit=2048){
    if(!Number.isInteger(limit)||limit<1||limit>4096)
      throw new Error('Invalid Foundry polyphony observation limit');
    this.limit=limit;
    this.voices=[];
    this.excluded=0;
    this.dirty=true;
    this.last=null;
  }
  reset(){
    this.voices=[];
    this.excluded=0;
    this.dirty=true;
    this.last=null;
  }
  record({track_id,start_time,stop_time,voice_gain}={}){
    if(typeof track_id!=='string'||!track_id||
       !Number.isFinite(start_time)||start_time<0||
       !Number.isFinite(stop_time)||stop_time<=start_time||
       !Number.isFinite(voice_gain)||voice_gain<0||voice_gain>1)
      throw new Error('Invalid Foundry scheduled voice observation');
    if(this.voices.length>=this.limit){
      this.excluded++;
      this.dirty=true;
      return;
    }
    this.voices.push({track_id,start_time,stop_time,voice_gain});
    this.dirty=true;
  }
  snapshot(){
    if(!this.dirty)return this.last;
    const events=[];
    for(const v of this.voices){
      events.push({time:v.start_time,kind:1,voice_gain:v.voice_gain});
      events.push({time:v.stop_time,kind:-1,voice_gain:v.voice_gain});
    }
    // End before start at exactly the same time: no false overlap
    // where a recorded note stops and its replacement begins.
    events.sort((a,b)=>a.time-b.time||a.kind-b.kind);
    let active=0,sum=0,maxActive=0,maxSum=0;
    for(const event of events){
      active+=event.kind;
      sum+=event.voice_gain*event.kind;
      if(active>maxActive)maxActive=active;
      if(sum>maxSum)maxSum=sum;
    }
    this.last={
      evidence:'scheduled_sampled_voices_not_measured_audio',
      observed_voices:this.voices.length,
      excluded_voices:this.excluded,
      max_simultaneous_voices:maxActive,
      peak_summed_voice_gain:Number(maxSum.toFixed(3)),
      review_gain_summation:maxSum>1,
      observation_complete:this.excluded===0,
      caution:'Pre-effect sampled-voice gain sum only. Does not measure PCM peak, track volume, effects, speaker output or digital clipping.',
    };
    this.dirty=false;
    return this.last;
  }
}
