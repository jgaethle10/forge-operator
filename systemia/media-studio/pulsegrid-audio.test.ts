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

test('PulseGrid audio has deterministic stop and close cleanup',()=>{
  assert.match(audio,/activeSources\s*=\s*new Map<AudioScheduledSourceNode, AudioNode\[\]>/);
  assert.match(audio,/uiTimers\s*=\s*new Set/);
  assert.match(audio,/stopScheduledSources\(\)/);
  assert.match(audio,/disposeScheduledSource\(source/);
  assert.match(audio,/clearUiTimers\(\)/);
  assert.match(audio,/this\.disposeAllTrackBuses\(\)/);
  assert.match(audio,/disposeWorkletClock\(\)/);
  assert.match(audio,/this\.clockNode\.disconnect\(\)/);
  assert.match(audio,/this\.clockSink\.disconnect\(\)/);
  assert.match(audio,/this\.trackBuses\.clear\(\)/);
  assert.match(audio,/context\.close\(\)/);

  const stopStart=audio.indexOf('stop() {');
  const closeStart=audio.indexOf('async close()',stopStart);
  assert.ok(stopStart>=0&&closeStart>stopStart,'Missing stop lifecycle boundary.');
  const stopBody=audio.slice(stopStart,closeStart);
  assert.match(stopBody,/this\.clearUiTimers\(\)/);
  assert.match(stopBody,/this\.stopScheduledSources\(\)/);
  assert.match(stopBody,/this\.disposeAllTrackBuses\(\)/);
});

test('PulseGrid audio remains a consumer of canonical session state',()=>{
  assert.match(audio,/import type \{ PulseGridSession, PulseGridTrack \} from '\.\/pulsegrid-session\.js'/);
  assert.match(audio,/this\.session\s*=\s*structuredClone\(session\)/);
  assert.doesNotMatch(audio,/node:/);
  assert.doesNotMatch(audio,/class\s+PulseGridSession/);
});


test('PulseGrid scene switches clear scheduled old-scene audio before worklet reset',()=>{
  const sceneStart=audio.indexOf('setScene(scene: number)');
  const playStart=audio.indexOf('async play(',sceneStart);
  assert.ok(sceneStart>=0&&playStart>sceneStart,'Missing setScene lifecycle boundary.');
  const sceneBody=audio.slice(sceneStart,playStart);
  assert.match(sceneBody,/this\.clearUiTimers\(\)/);
  assert.match(sceneBody,/this\.stopScheduledSources\(\)/);
  assert.match(sceneBody,/type: 'reset'/);
});
