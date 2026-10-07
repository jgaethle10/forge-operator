import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const audio=fs.readFileSync('systemia/media-studio/pulsegrid-audio.ts','utf8');
const worklet=fs.readFileSync('systemia/media-studio/pulsegrid-clock-worklet.js','utf8');

test('PulseGrid audio execution keeps one reusable DSP bus per canonical track',()=>{
  assert.match(audio,/new Map<string, PulseGridTrackBus>\(\)/);
  assert.match(audio,/private ensureTrackBus\(track: PulseGridTrack\)/);
  assert.match(audio,/this\.trackBuses\.get\(track\.id\)/);
  assert.match(audio,/this\.trackBuses\.set\(track\.id, bus\)/);
  assert.equal((audio.match(/createDelay\(/g)||[]).length,1,'delay nodes must be created by the reusable bus builder only');
  assert.doesNotMatch(audio,/createTrackBus/);
});

test('PulseGrid audio execution is AudioWorklet-first with an explicit fallback clock',()=>{
  assert.match(audio,/audioWorklet\.addModule\(new URL\('\.\/pulsegrid-clock-worklet\.js', import\.meta\.url\)\)/);
  assert.match(audio,/new AudioWorkletNode\(context, 'pulsegrid-clock'/);
  assert.match(audio,/this\.timingMode = 'worklet'/);
  assert.match(audio,/private startFallbackClock\(startTime: number\)/);
  assert.match(audio,/this\.timingMode = 'fallback'/);
  assert.match(audio,/clock_error/);
  assert.match(worklet,/registerProcessor\('pulsegrid-clock',PulseGridClockProcessor\)/);
  assert.match(worklet,/this\.port\.postMessage\(\{type:'schedule',step:this\.step,time:this\.nextFrame\/sampleRate\}\)/);
});

test('PulseGrid audio stop and close paths deterministically release bounded browser nodes',()=>{
  assert.match(audio,/private readonly activeSources = new Set<AudioScheduledSourceNode>\(\)/);
  assert.match(audio,/private stopScheduledSources\(\)/);
  assert.match(audio,/private disposeTrackBus\(bus: PulseGridTrackBus\)/);
  assert.match(audio,/private disposeAllTrackBuses\(\)/);
  assert.match(audio,/this\.trackBuses\.clear\(\)/);
  assert.match(audio,/this\.disposeAllTrackBuses\(\)/);
  assert.match(audio,/this\.clock\.disconnect\(\)/);
  assert.match(audio,/this\.clockSink\.disconnect\(\)/);
  assert.match(audio,/this\.master\.disconnect\(\)/);
});

test('PulseGrid audio adapter consumes the canonical session graph rather than defining musical state',()=>{
  assert.match(audio,/import type \{ PulseGridSession, PulseGridTrack \} from '\.\/pulsegrid-session\.js'/);
  assert.match(audio,/updateSession\(session: PulseGridSession\)/);
  assert.match(audio,/this\.session = structuredClone\(session\)/);
  assert.doesNotMatch(audio,/interface\s+PulseGridSession/);
  assert.doesNotMatch(audio,/type\s+PulseGridSession\s*=/);
  assert.doesNotMatch(audio,/node:/);
});
