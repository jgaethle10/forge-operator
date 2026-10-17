import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=()=>fs.readFileSync('src/FallenSessions.tsx','utf8');
const clip=()=>fs.readFileSync('systemia/media-studio/pulsegrid-audio.ts','utf8');

test('Foundry WAV appears as a separate deliberate import path, not a replacement for generic audio',()=>{
  const source=ui();
  assert.match(source,/Import Audio<\/button>/);
  assert.match(source,/Import Foundry WAV<\/button>/);
  assert.match(source,/importFoundryWavFile/);
  assert.match(source,/importAudioFile/);
  assert.match(source,/accept="\.wav,audio\/wav,audio\/x-wav,audio\/wave"/);
});
test('actual stored WAV bytes undergo separate verification before graph mutation',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/vault\.ingest/);
  assert.match(fn,/await vault\.getVerifiedBlob\(asset\)/);
  assert.match(fn,/await verifyFoundryWavBytes\(/);
  assert.match(fn,/compileFoundryImport\(/);
  assert.match(fn,/applyPulseGridTransaction\(/);
  assert.ok(fn.indexOf('verifyFoundryWavBytes')<fn.indexOf('applyPulseGridTransaction'));
});
test('Foundry local audition cannot grant rights, assert provider auth or release',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/rights:'unknown'/);
  assert.match(fn,/local audition/);
  assert.match(fn,/no commercial release clearance/);
  assert.doesNotMatch(fn,/rights:'owned'/);
  assert.doesNotMatch(fn,/release_ready:true/);
});
test('Foundry WAV scene adapts to recording and rejects >16 bars instead of silent truncation',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/const requiredBars=/);
  assert.match(fn,/PULSEGRID_MAX_CLIP_BARS/);
  assert.match(fn,/throw new Error\('Foundry take exceeds the 16-bar audition limit/);
  assert.match(fn,/type:'clip.set_bars'/);
  assert.ok(fn.indexOf('requiredBars>PULSEGRID_MAX_CLIP_BARS')<fn.indexOf('applyPulseGridTransaction'));
  assert.match(clip(),/scheduleAudioAsset\(bus\.input,assetBuffer,time,sceneDuration\)/);
});
test('browser already uses the same local verified asset vault for actual audio execution',()=>{
  const source=ui();
  assert.match(source,/new PulseGridAudioEngine\(\)/);
  assert.match(source,/setAudioAssetResolver\(\(asset\)=>vaultRef\.current!\.getVerifiedBlob\(asset\)\)/);
  assert.match(source,/audioRef\.current\?\.play\(session,selectedScene\)/);
});

test('Foundry take explicitly selects one-shot while other PulseGrid audio remains loop-capable',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/type:'clip.set_audio_playback_mode'/);
  assert.match(fn,/mode:'one_shot'/);
  assert.match(clip(),/schedulePulseGridAudioBuffer/);
  assert.match(clip(),/audio_playback_mode==='one_shot'/);
});
test('missing verified audio fails visibly instead of pretending an empty buffer played',()=>{
  assert.match(clip(),/throw new Error\('PulseGrid audio asset is missing from verified storage:/);
});
