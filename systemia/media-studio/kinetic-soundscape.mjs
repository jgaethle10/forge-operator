import crypto from 'node:crypto';

/**
 * Original deterministic Foley/sound-design synthesis for synthetic industrial film.
 * This is an internal soundtrack experiment, not a field recording, licensed score,
 * voice actor, physically measured motor, or professional final master.
 */
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function seedFrom(text){
  let x=2166136261;
  for(let i=0;i<text.length;i++){x=Math.imul(x^text.charCodeAt(i),16777619)}
  return (x>>>0)||1;
}
function timeBand(t,start,end,attack,release){
  return smooth((t-start)/attack)*(1-smooth((t-end)/release));
}
function hit(time,at,power){
  const x=time-at;
  if(x<0)return 0;
  const envelope=Math.exp(-11*x);
  const metal=(.50*Math.sin(2*Math.PI*286*x)
    +.26*Math.sin(2*Math.PI*547.2*x)
    +.16*Math.sin(2*Math.PI*938.7*x));
  const sub=Math.sin(2*Math.PI*(67*x+14*x*x))*Math.exp(-4*x);
  return power*(metal*envelope*.45+sub*.42);
}

/**
 * Create a 16-bit 48kHz stereo PCM WAV with a movie-style mechanical evolution:
 * ignition -> accelerating motor -> brushed air pass -> two metallic beats -> tail.
 * Timings are authored beats; no inferred explosions or recorded sound claims.
 */
export function renderKineticSoundscape({
  durationSec=2, sampleRate=48000,
  seed='evercraft-original-industrial-orbit-v1',
  impacts=[{at:.26,power:.7},{at:1.27,power:1}],
  movement='orbit'
}={}){
  if(!Number.isFinite(durationSec)||durationSec<.8||durationSec>30)throw Error('soundscape_duration_invalid');
  if(sampleRate!==48000)throw Error('soundscape_sample_rate_invalid');
  if(typeof seed!=='string'||seed.length<3||seed.length>180)throw Error('soundscape_seed_invalid');
  if(!['orbit','dolly','crane','follow'].includes(movement))throw Error('soundscape_movement_invalid');
  if(!Array.isArray(impacts)||impacts.length>8)throw Error('soundscape_impacts_invalid');
  let last=-Infinity;
  for(const event of impacts){
    if(!Number.isFinite(event?.at)||event.at<0||event.at>durationSec-.06
      ||!Number.isFinite(event?.power)||event.power<.05||event.power>1
      ||event.at-last<.09)throw Error('soundscape_impact_event_invalid');
    last=event.at;
  }
  const frames=Math.round(durationSec*sampleRate);
  const left=new Float32Array(frames),right=new Float32Array(frames);
  const delayA=Math.round(.064*sampleRate),delayB=Math.round(.139*sampleRate);
  let phase=0,noiseLp=0,airLp=0;
  let random=seedFrom(seed);
  const nextNoise=()=>{
    random^=random<<13;random^=random>>>17;random^=random<<5;
    return (random>>>0)/2147483648-1;
  };
  let rawPeak=0;
  for(let i=0;i<frames;i++){
    const t=i/sampleRate,u=t/durationSec;
    const motorFrequency=66+21*smooth(u)+1.3*Math.sin(2*Math.PI*1.2*t);
    phase+=2*Math.PI*motorFrequency/sampleRate;
    const ignition=timeBand(t,.02,durationSec-.17,.19,.2);
    const engine=(.22*Math.sin(phase)+.10*Math.sin(phase*.5+0.3)
      +.065*Math.sin(phase*1.997))*ignition;
    // A restrained low-frequency cinematic drone and harmonic bed.
    const sub=(.11*Math.sin(2*Math.PI*43.65*t)
      +.08*Math.sin(2*Math.PI*65.41*t)
      +.055*Math.sin(2*Math.PI*98*t))*timeBand(t,0,durationSec-.08,.28,.14);
    // Different filtered noise bands give air movement and rotor grain.
    const noise=nextNoise();
    noiseLp+=.025*(noise-noiseLp);
    airLp+=.3*(noise-airLp);
    const air=noise-airLp;
    const grain=noiseLp;
    const flyby=.05+.22*Math.exp(-Math.pow((u-.63)/.23,2));
    const airSound=air*flyby*.43;
    const texture=grain*.12*ignition;
    let metallic=0;
    for(const event of impacts)metallic+=hit(t,event.at,event.power);
    const spectralRise=(.035*Math.sin(2*Math.PI*(312*t+160*t*t))
      +.025*Math.sin(2*Math.PI*(465*t+110*t*t)))*flyby;
    const motionPan=movement==='orbit'?clamp(.68*(2*u-1),-.7,.7)
      : movement==='follow'?.45*Math.sin(2*Math.PI*.32*t)
      : movement==='crane'?.16:.0;
    const mono=engine+sub+texture+airSound+metallic+spectralRise;
    const gate=Math.min(1,Math.max(0,t/.045),Math.max(0,(durationSec-t)/.19));
    const leftDry=mono*gate*(1-motionPan*.22);
    const rightDry=mono*gate*(1+motionPan*.22);
    // Two short, quiet reflections. Stereo offset keeps the center image solid.
    const echoL=i>=delayA?left[i-delayA]*.085:0;
    const echoR=i>=delayB?right[i-delayB]*.115:0;
    const l=(leftDry+echoL);
    const r=(rightDry+echoR);
    left[i]=l;right[i]=r;
    rawPeak=Math.max(rawPeak,Math.abs(l),Math.abs(r));
  }
  if(!Number.isFinite(rawPeak)||rawPeak<.01)throw Error('soundscape_insufficient_audio_energy');
  const peakCeiling=Math.pow(10,-1.7/20);
  const scale=Math.min(1.65,peakCeiling/rawPeak);
  const dataBytes=frames*2*2;
  const wav=Buffer.alloc(44+dataBytes);
  wav.write('RIFF',0);wav.writeUInt32LE(36+dataBytes,4);
  wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);
  wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*4,28);
  wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(dataBytes,40);
  let sum=0,sumDifference=0,peak=0,nonSilent=0;
  for(let i=0;i<frames;i++){
    const l=clamp(left[i]*scale,-peakCeiling,peakCeiling);
    const r=clamp(right[i]*scale,-peakCeiling,peakCeiling);
    wav.writeInt16LE(Math.round(l*32767),44+i*4);
    wav.writeInt16LE(Math.round(r*32767),46+i*4);
    sum+=l*l+r*r;sumDifference+=(l-r)*(l-r);
    peak=Math.max(peak,Math.abs(l),Math.abs(r));
    if(Math.max(Math.abs(l),Math.abs(r))>.005)nonSilent++;
  }
  const rms=Math.sqrt(sum/(frames*2));
  const receipt={
    schema:'evercraft.media.kinetic-soundscape.v1',
    sourceState:'original_synthesis_not_recorded_foley',
    musicLicenseState:'not_applicable_original_synthesis',
    voicePresent:false, sampleRate,channels:2,
    durationSec,frames,seed,movement,
    impacts:impacts.map(x=>({...x})),
    peaks:{peakDbfs:Number((20*Math.log10(peak)).toFixed(2)),
      rmsDbfs:Number((20*Math.log10(Math.max(rms,1e-12))).toFixed(2)),
      stereoDifferenceDbfs:Number((20*Math.log10(Math.sqrt(sumDifference/frames))).toFixed(2)),
      nonSilentFraction:Number((nonSilent/frames).toFixed(4))},
    sha256:sha(wav),mixState:'pre_master_original_synth',
    publicationAuthority:false
  };
  return {wav,receipt};
}
