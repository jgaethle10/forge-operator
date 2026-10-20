import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {renderKineticSoundscape} from './kinetic-soundscape.mjs';

const rms=(wav,startSec,endSec)=>{
  const start=Math.round(startSec*48000),end=Math.round(endSec*48000);
  let total=0;
  for(let i=start;i<end;i++){
    const l=wav.readInt16LE(44+i*4)/32768;
    const r=wav.readInt16LE(46+i*4)/32768;
    total+=l*l+r*r;
  }
  return Math.sqrt(total/((end-start)*2));
};
const sig=b=>crypto.createHash('sha256').update(b).digest('hex');

test('generates a true dual-channel 48kHz 16-bit 2s WAV and bounded peak',()=>{
  const {wav,receipt}=renderKineticSoundscape();
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.toString('ascii',36,40),'data');
  assert.equal(wav.readUInt16LE(22),2);
  assert.equal(wav.readUInt32LE(24),48000);
  assert.equal(wav.readUInt16LE(34),16);
  assert.equal(wav.length,44+2*48000*4);
  assert.equal(receipt.sha256,sig(wav));
  assert.equal(receipt.frames,96000);
  assert.equal(receipt.publicationAuthority,false);
  assert.ok(receipt.peaks.peakDbfs<=-1.69);
  assert.ok(receipt.peaks.rmsDbfs>-36&&receipt.peaks.rmsDbfs<-9);
  assert.ok(receipt.peaks.nonSilentFraction>.65);
});
test('original layers are deterministic but beats, camera movement and seeds change the waveform',()=>{
  const a=renderKineticSoundscape(),b=renderKineticSoundscape();
  assert.equal(a.receipt.sha256,b.receipt.sha256);
  assert.deepEqual(a.wav,b.wav);
  const c=renderKineticSoundscape({seed:'new-camera-v2'});
  const d=renderKineticSoundscape({movement:'crane'});
  const e=renderKineticSoundscape({impacts:[]});
  assert.notEqual(a.receipt.sha256,c.receipt.sha256);
  assert.notEqual(a.receipt.sha256,d.receipt.sha256);
  assert.notEqual(a.receipt.sha256,e.receipt.sha256);
  assert.ok(a.receipt.peaks.stereoDifferenceDbfs>-70);
});
test('sound has transient dynamics, rises through action and fades near end',()=>{
  const {wav}=renderKineticSoundscape();
  const early=rms(wav,.02,.12);
  const motor=rms(wav,.38,.52);
  const impact=rms(wav,1.265,1.335);
  const tail=rms(wav,1.965,1.995);
  assert.ok(motor>early*1.25,{early,motor});
  assert.ok(impact>tail*2,{impact,tail});
  assert.ok(tail<motor*.8,{tail,motor});
});
test('rejects oversized, invalid and nonsensical events before allocation',()=>{
  const cases=[
    {durationSec:0},{durationSec:31},{durationSec:NaN},
    {sampleRate:44100},{seed:''},{seed:'ab'},{movement:'zoom'},
    {impacts:[{at:-1,power:1}]},{impacts:[{at:2,power:1}]},
    {impacts:[{at:.3,power:0}]},{impacts:[{at:.3,power:2}]},
    {impacts:[{at:.5,power:1},{at:.55,power:1}]},
    {impacts:Array.from({length:9},(_,i)=>({at:i*.1,power:1}))}
  ];
  for(const props of cases){
    assert.throws(()=>renderKineticSoundscape(props),/soundscape_/);
  }
});
