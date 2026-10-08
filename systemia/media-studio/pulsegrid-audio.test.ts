import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const audio=fs.readFileSync('systemia/media-studio/pulsegrid-audio.ts','utf8');

test('PulseGrid audio uses one reusable DSP bus map instead of per-step effect graphs',()=>{
  assert.match(audio,/trackBuses\s*=\s*new Map/);
  assert.match(audio,/ensureTrackBuses\(\)/);
  assert.match(audio,/createTrackBus\(\)/);
  assert.match(audio,/disposeAllTrackBuses\(\)/);
  assert.match(audio,/disconnectBus\(bus/);

  const scheduleStart=audio.indexOf('private scheduleStep(');
  const kickStart=audio.indexOf('private kick(',scheduleStart);
  assert.ok(scheduleStart>=0&&kickStart>scheduleStart,'Missing bounded scheduleStep body.');
  const scheduleBody=audio.slice(scheduleStart,kickStart);
  assert.doesNotMatch(scheduleBody,/createTrackBus\(/,'scheduleStep must reuse existing track buses.');
  assert.match(scheduleBody,/this\.trackBuses\.get\(track\.id\)/);
});

test('PulseGrid audio prefers the AudioWorklet clock and retains an explicit fallback',()=>{
  assert.match(audio,/audioWorklet\.addModule/);
  assert.match(audio,/new AudioWorkletNode/);
  assert.match(audio,/pulsegrid-clock-worklet\.js/);
  assert.match(audio,/clockMode\s*=\s*'worklet'/);
  assert.match(audio,/startFallbackClock\(\)/);
  assert.match(audio,/clockMode\s*=\s*'fallback'/);
  assert.match(audio,/fallbackScheduler\(\)/);
});

test('PulseGrid audio has deterministic clock and DSP cleanup',()=>{
  assert.match(audio,/disposeWorkletClock\(\)/);
  assert.match(audio,/this\.clockNode\.disconnect\(\)/);
  assert.match(audio,/this\.clockSink\.disconnect\(\)/);
  assert.match(audio,/this\.trackBuses\.clear\(\)/);
  assert.match(audio,/context\.close\(\)/);
});

test('PulseGrid audio remains a consumer of canonical session state',()=>{
  assert.match(audio,/pulsegrid-session/);
  assert.match(audio,/PulseGridSession/);
  assert.match(audio,/PulseGridTrack/);
  assert.match(audio,/this\.session\s*=\s*structuredClone\(session\)/);
  assert.doesNotMatch(audio,/node:/);
  assert.doesNotMatch(audio,/class\s+PulseGridSession/);
});


test('PulseGrid audio resolves canonical asset IDs through a replaceable resolver',()=>{
  assert.match(audio,/setAudioAssetResolver/);
  assert.match(audio,/PulseGridAudioAssetResolver/);
  assert.match(audio,/clip\.audio_asset_id/);
  assert.match(audio,/this\.audioBuffers\.get\(clip\.audio_asset_id\)/);
  assert.match(audio,/resolver\(asset\)/);
  assert.doesNotMatch(audio,/indexedDB/);
});

test('PulseGrid audio caches decoded canonical assets and clears them on close',()=>{
  assert.match(audio,/audioBuffers\s*=\s*new Map/);
  assert.match(audio,/pendingAssetLoads\s*=\s*new Map/);
  assert.match(audio,/context\.decodeAudioData/);
  assert.match(audio,/this\.audioBuffers\.clear\(\)/);
  assert.match(audio,/this\.pendingAssetLoads\.clear\(\)/);
});

test('PulseGrid audio explicitly tracks and stops scheduled sound sources',()=>{
  assert.match(audio,/activeSources\s*=\s*new Set/);
  assert.match(audio,/trackSource/);
  assert.match(audio,/for\(const source of this\.activeSources\)/);
  assert.match(audio,/this\.activeSources\.clear\(\)/);
});

test('PulseGrid audio never fabricates missing asset bytes',()=>{
  const audioTrackBlock=audio.slice(audio.indexOf("if (track.type === 'audio')"),audio.indexOf('const noteEvents'));
  assert.match(audioTrackBlock,/audio_asset_id/);
  assert.match(audioTrackBlock,/this\.audioBuffers\.get/);
  assert.doesNotMatch(audioTrackBlock,/createBuffer\(/);
});
