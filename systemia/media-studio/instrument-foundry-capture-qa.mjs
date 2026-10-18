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


/**
 * Estimate whether a bounded, mostly pitched piano recording agrees with the
 * explicitly selected MIDI root. A normalized lag search on de-meaned audio
 * is intentionally a CONSERVATIVE audition gate, never a legal, human or
 * instrument-authenticity certification. Natural inharmonicity/noisy attacks
 * may yield 'indeterminate'; those takes need musician review.
 */
export function checkFoundryPianoRootPitch(input,expectedMidi){
  if(!Number.isInteger(expectedMidi)||expectedMidi<21||expectedMidi>108){
    throw new Error('Expected piano root must be an integer MIDI note 21..108');
  }
  const bytes=input instanceof ArrayBuffer?new Uint8Array(input):input;
  const w=readWav(bytes);
  const expectedHz=440*Math.pow(2,(expectedMidi-69)/12);
  // Preserve >=10 samples per period, while using a fixed bounded window.
  const desiredRate=Math.max(11025,expectedHz*11);
  const stride=Math.max(1,Math.floor(w.rate/desiredRate));
  const sampledRate=w.rate/stride;
  const firstFrame=Math.min(w.frames-1,Math.floor(w.rate*.035));
  const lastFrame=Math.min(w.frames,firstFrame+Math.floor(w.rate*.25));
  const n=Math.floor((lastFrame-firstFrame)/stride);
  if(n<64)throw new Error('Insufficient WAV frames for pitch inspection');
  // Inspect the strongest channel, not an L+R sum: a legitimate stereo
  // sample can have opposing polarity and would vanish under averaging.
  const candidates=Array.from({length:w.channels},()=>new Float64Array(n));
  const channelMeans=new Float64Array(w.channels);
  for(let i=0;i<n;i++){
    const at=firstFrame+i*stride;
    for(let c=0;c<w.channels;c++){
      const sample=sampleAt(w,at,c);
      if(!Number.isFinite(sample))return {
        schema:'evercraft.fallen.piano-root-evidence.v1',status:'indeterminate',
        expected_midi:expectedMidi,expected_hz:Number(expectedHz.toFixed(3)),
        estimated_hz:null,cents_error:null,periodicity:0,
        reason:'nonfinite_sample_values',human_pitch_confirmed:false
      };
      candidates[c][i]=sample;channelMeans[c]+=sample;
    }
  }
  let x=candidates[0],totalEnergy=-1;
  for(let c=0;c<w.channels;c++){
    const mean=channelMeans[c]/n;
    let energy=0;
    for(let i=0;i<n;i++){candidates[c][i]-=mean;energy+=candidates[c][i]*candidates[c][i]}
    if(energy>totalEnergy){totalEnergy=energy;x=candidates[c]}
  }
  const floor=Math.sqrt(totalEnergy/n);
  const blank=(reason)=>({
    schema:'evercraft.fallen.piano-root-evidence.v1',status:'indeterminate',
    expected_midi:expectedMidi,expected_hz:Number(expectedHz.toFixed(3)),
    estimated_hz:null,cents_error:null,periodicity:0,
    reason,human_pitch_confirmed:false
  });
  if(floor<.00035)return blank('insufficient_pitched_signal_energy');
  // Examine a localized pitch range; a distant/missing pitch results in a
  // fail-closed 'indeterminate' rather than an invented global note label.
  const semitoneRange=Math.pow(2,8/12);
  const lowLag=Math.max(2,Math.floor(sampledRate/(expectedHz*semitoneRange)));
  const highLag=Math.min(Math.floor(n*.52),Math.ceil(sampledRate/(expectedHz/semitoneRange)));
  if(highLag<=lowLag+2)return blank('insufficient_period_resolution');
  const scores=new Float64Array(highLag+2);
  let best=-Infinity,bestLag=0;
  for(let lag=lowLag;lag<=highLag;lag++){
    let difference=0,energy=0;
    // Bounded CPU: at most 0.25 seconds of decimated audio for this check.
    for(let i=0;i<n-lag;i++){
      const a=x[i],b=x[i+lag],delta=a-b;
      difference+=delta*delta;
      energy+=a*a+b*b;
    }
    const score=energy>1e-13?1-difference/energy:0;
    scores[lag]=score;
    if(score>best){best=score;bestLag=lag}
  }
  if(best<.60||bestLag<=lowLag||bestLag>=highLag){
    return {...blank('fundamental_period_not_confidently_resolved'),
      periodicity:Number(Math.max(0,best).toFixed(4))};
  }
  const a=scores[bestLag-1],b=scores[bestLag],c=scores[bestLag+1];
  const curvature=a-2*b+c;
  const offset=Math.abs(curvature)>1e-9?
    Math.max(-.5,Math.min(.5,.5*(a-c)/curvature)):0;
  const measuredHz=sampledRate/(bestLag+offset);
  const cents=1200*Math.log2(measuredHz/expectedHz);
  // Autocorrelation alone cannot distinguish a true lower piano note from
  // its higher octave: both repeat at the lower note's period. Check whether
  // the actual sound contains EITHER the root partial OR a pair of 2nd+3rd
  // harmonics that jointly imply the virtual fundamental. Pure octave/even-
  // harmonic recordings are held, not assigned to the wrong MIDI key.
  const harmonicPower=multiple=>{
    const hz=measuredHz*multiple;
    if(hz>=sampledRate*.49)return 0;
    let real=0,imag=0;
    for(let i=0;i<n;i++){
      const window=.5-.5*Math.cos(2*Math.PI*i/(n-1));
      const angle=2*Math.PI*hz*i/sampledRate;
      const v=x[i]*window;
      real+=v*Math.cos(angle);
      imag-=v*Math.sin(angle);
    }
    return real*real+imag*imag;
  };
  const rootEnergy=harmonicPower(1);
  const secondEnergy=harmonicPower(2);
  const thirdEnergy=harmonicPower(3);
  const evenOctaveEnergy=Math.max(secondEnergy,1e-12);
  const rootPresent=rootEnergy>=evenOctaveEnergy*.035;
  const virtualRoot=secondEnergy>1e-10&&thirdEnergy>=evenOctaveEnergy*.055;
  if(Math.abs(cents)<=45&&!rootPresent&&!virtualRoot){
    return {
      ...blank('octave_ambiguous_no_root_or_third_harmonic_evidence'),
      estimated_hz:Number(measuredHz.toFixed(3)),
      cents_error:Number(cents.toFixed(2)),
      periodicity:Number(best.toFixed(4)),
    };
  }
  const matched=Math.abs(cents)<=45;
  return {
    schema:'evercraft.fallen.piano-root-evidence.v1',
    status:matched?'consistent':'mismatch',
    expected_midi:expectedMidi,
    expected_hz:Number(expectedHz.toFixed(3)),
    estimated_hz:Number(measuredHz.toFixed(3)),
    cents_error:Number(cents.toFixed(2)),
    periodicity:Number(best.toFixed(4)),
    reason:matched?'instrument_capture_pitch_consistent':'pitch_outside_selected_midi_tolerance',
    human_pitch_confirmed:false
  };
}
