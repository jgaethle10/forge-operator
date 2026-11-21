import test from 'node:test';
import assert from 'node:assert/strict';
import {foundryPedalDurationSteps as duration,validateFoundryPedalEvents as validate} from './instrument-foundry-pedal.mjs';
import {createPulseGridSession,applyPulseGridOperation,undoPulseGridReceipt,applyPulseGridTransaction} from './pulsegrid-session.ts';
const ev=(step,down)=>({step,down});

test('pedal up is byte-for-byte equivalent to ordinary key-off timing',()=>{
 assert.equal(duration({events:[],start_step:0,length_steps:1,clip_steps:16}),1);
 assert.equal(duration({events:[ev(2,true),ev(5,false)],start_step:0,length_steps:1,clip_steps:16}),1);
});
test('pedal down at key-off holds until explicit lift, never beyond clip',()=>{
 assert.equal(duration({events:[ev(0,true),ev(6,false)],start_step:1,length_steps:2,clip_steps:16}),5);
 assert.equal(duration({events:[ev(0,true)],start_step:1,length_steps:2,clip_steps:16}),15);
});
test('pedal lifts exactly at key-off and does not add a false tail',()=>{
 assert.equal(duration({events:[ev(0,true),ev(3,false)],start_step:1,length_steps:2,clip_steps:16}),2);
});
test('late depression cannot resurrect a released key',()=>{
 assert.equal(duration({events:[ev(4,true),ev(7,false)],start_step:0,length_steps:2,clip_steps:16}),2);
});
test('pedal may span multiple off/on cycles without leaking across separate notes',()=>{
 const events=[ev(0,true),ev(3,false),ev(7,true),ev(12,false)];
 assert.equal(duration({events,start_step:1,length_steps:1,clip_steps:16}),2);
 assert.equal(duration({events,start_step:8,length_steps:1,clip_steps:16}),4);
});
test('unbounded, malformed, ambiguous or duplicate events fail closed',()=>{
 for(const events of [
  [ev(0,false)],[ev(0,true),ev(1,true)],
  [ev(2,true),ev(2,false)],[ev(3,true),ev(1,false)],
  [ev(-1,true)],[ev(16,true)],[{step:0,down:1}],
  Array.from({length:65},(_,i)=>ev(i,i%2===0))
 ])assert.throws(()=>validate(events,16),/Invalid|alternate/);
 assert.throws(()=>duration({events:[],start_step:0,length_steps:17,clip_steps:16}),/span/);
 assert.throws(()=>duration({events:[],start_step:-1,length_steps:1,clip_steps:16}),/span/);
});
test('single canonical operation is reversible and preserves notes/rights',()=>{
 const base=createPulseGridSession('pedal no-op migration');
 const original=structuredClone(base);
 const {session,receipt}=applyPulseGridOperation(base,{
  type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,
  events:[ev(0,true),ev(3,false)]
 },'human');
 assert.deepEqual(session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,
  [ev(0,true),ev(3,false)]);
 assert.equal(session.receipts.at(-1).operation,'clip.set_foundry_piano_pedal');
 assert.deepEqual(base,original);
 const undo=undoPulseGridReceipt(session,receipt.id,'human').session;
 assert.equal(undo.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,undefined);
});
test('a batch pedal edit reverts atomically with the canonical transaction',()=>{
 const base=createPulseGridSession('pedal transaction');
 const {session,receipt}=applyPulseGridTransaction(base,{
  intent:'audition piano pedal event automation',
  operations:[
   {type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,events:[ev(0,true),ev(8,false)]},
   {type:'transport.set_tempo',bpm:96}
  ]
 },'human');
 assert.equal(session.transport.bpm,96);
 assert.deepEqual(session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,[ev(0,true),ev(8,false)]);
 const undone=undoPulseGridReceipt(session,receipt.id,'human').session;
 assert.equal(undone.transport.bpm,base.transport.bpm);
 assert.equal(undone.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,undefined);
});
test('other tracks and invalid payloads cannot gain piano pedal metadata',()=>{
 const s=createPulseGridSession('pedal boundaries');
 assert.throws(()=>applyPulseGridOperation(s,{
  type:'clip.set_foundry_piano_pedal',track_id:'drums',scene:0,events:[ev(0,true)]
 }),/synth/);
 assert.throws(()=>applyPulseGridOperation(s,{
  type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,events:[ev(1,false)]
 }),/alternate/);
});
