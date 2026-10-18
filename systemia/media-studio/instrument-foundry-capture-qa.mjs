/**
 * Foundry technical signal preflight for actual WAV bytes.
 *
 * This module inspects PCM/IEEE float sample values, NOT just a manifest or
 * SHA-256. It is deliberately a conservative capture gate, not a substitute
 * for listening, pitch identification, performer clearance, or mastering.
 */
function readWav(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<44||bytes.length>64*1024*1024)
    throw new Error('Foundry capture requires bounded WAV bytes');
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const id=o=>String.fromCharCode(...bytes.subarray(o,o+4));
  if(id(0)!=='RIFF'||id(8)!=='WAVE'||d.getUint32(4,true)+8!==bytes.byteLength)
    throw new Error('Invalid WAV container');
  let fmt=null,data=null,offset=12;
  while(offset+8<=bytes.length){
    const kind=id(offset),size=d.getUint32(offset+4,true),from=offset+8;
    if(size>bytes.length-from)throw new Error('Malformed WAV chunk');
    if(kind==='fmt '){
      if(size<16||fmt)throw new Error('Invalid WAV format chunk');
      fmt={
        codec:d.getUint16(from,true),channels:d.getUint16(from+2,true),
        rate:d.getUint32(from+4,true),byteRate:d.getUint32(from+8,true),
        blockAlign:d.getUint16(from+12,true),bits:d.getUint16(from+14,true),
      };
    }
    if(kind==='data'){
      if(data)throw new Error('Ambiguous WAV data chunks');
      data={offset:from,size};
    }
    offset=from+size+(size%2);
  }
  if(!fmt||!data||data.size===0)throw new Error('Empty or missing audio data');
  if(![1,2].includes(fmt.channels)||![44100,48000,96000].includes(fmt.rate))
    throw new Error('Unsupported instrument capture channel count or rate');
  if(!(
    (fmt.codec===1&&[16,24,32].includes(fmt.bits)) ||
    (fmt.codec===3&&fmt.bits===32)
  ))throw new Error('Capture QA supports PCM 16/24/32 or float32 WAV only');
  const sampleBytes=fmt.bits/8;
  const align=sampleBytes*fmt.channels;
  if(fmt.blockAlign!==align||fmt.byteRate!==fmt.rate*align||
    data.size%align!==0)throw new Error('WAV block alignment mismatch');
  const frames=data.size/align;
  const seconds=frames/fmt.rate;
  if(seconds<.3||seconds>15)throw new Error('Piano capture must last 0.3 to 15 seconds');
  return {...fmt,...data,frames,seconds,sampleBytes,d};
}
function sampleAt(w,frame,channel){
  const o=w.offset+(frame*w.channels+channel)*w.sampleBytes;
  if(w.codec===3)return w.d.getFloat32(o,true);
  if(w.bits===16)return w.d.getInt16(o,true)/32768;
  if(w.bits===32)return w.d.getInt32(o,true)/2147483648;
  const value=w.d.getUint8(o)|(w.d.getUint8(o+1)<<8)|(w.d.getUint8(o+2)<<16);
  return ((value&0x800000)?value-0x1000000:value)/8388608;
}

export function analyzeFoundryPianoWav(input){
  const bytes=input instanceof ArrayBuffer?new Uint8Array(input):input;
  const w=readWav(bytes);
  let peak=0,sum=0,sum2=0,clipped=0,nonfinite=0,tailSum2=0;
  const tailStart=Math.max(0,w.frames-Math.floor(w.rate*.07));
  for(let frame=0;frame<w.frames;frame++){
    for(let channel=0;channel<w.channels;channel++){
      const v=sampleAt(w,frame,channel);
      if(!Number.isFinite(v)||Math.abs(v)>1.01){nonfinite++;continue}
      const abs=Math.abs(v);
      if(abs>peak)peak=abs;
      if(abs>=.9995)clipped++;
      sum+=v;sum2+=v*v;
      if(frame>=tailStart)tailSum2+=v*v;
    }
  }
  const count=w.frames*w.channels;
  const rms=Math.sqrt(sum2/count);
  const tailCount=(w.frames-tailStart)*w.channels;
  const tailRms=Math.sqrt(tailSum2/tailCount);
  const db=v=>v>0?20*Math.log10(v):-180;
  const dc=sum/count;
  const blockers=[];
  if(nonfinite)blockers.push('nonfinite_or_out_of_range_audio');
  if(db(rms)<-65||db(peak)<-52)blockers.push('recording_near_silent');
  if(Math.abs(dc)>.075)blockers.push('excessive_dc_offset');
  if(clipped>=Math.max(6,Math.ceil(count*.0002)))blockers.push('sustained_sample_clipping');
  // A loud final 70 ms means the note likely got sliced before its decay.
  // This is a technical warning/blocker, not a claim about artistic taste.
  if(db(tailRms)>-32&&tailRms>rms*.18)
    blockers.push('piano_decay_tail_cut_or_recording_untrimmed');
  const metrics={
    sample_rate:w.rate,channels:w.channels,bit_depth:w.bits,codec:w.codec,
    duration_sec:Number(w.seconds.toFixed(4)),
    peak_dbfs:Number(db(peak).toFixed(2)),
    rms_dbfs:Number(db(rms).toFixed(2)),
    tail_rms_dbfs:Number(db(tailRms).toFixed(2)),
    dc_offset:Number(dc.toFixed(6)),
    clipped_sample_count:clipped,
    samples_examined:count
  };
  return {
    schema:'evercraft.fallen.piano-capture-technical-qa.v1',
    status:blockers.length?'held':'technical_signal_pass',
    blockers,metrics,
    musical_quality_approved:false,
    actual_note_pitch_verified:false,
    performer_rights_verified:false,
    commercial_release_ready:false
  };
}
