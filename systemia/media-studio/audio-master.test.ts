import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAudioMasterGraph,
  normalizeAudioMasterPolicy,
} from './audio-master.js';

test('builds dialogue-aware voice, music and sfx buses with loudness mastering',()=>{
  const graph=buildAudioMasterGraph({
    durationSec:12,
    clips:[
      {label:'voice-a',trackKind:'voice'},
      {label:'voice-b',trackKind:'voice'},
      {label:'music-a',trackKind:'music'},
      {label:'sfx-a',trackKind:'sfx'},
    ],
  });
  const filters=graph.filters.join('');
  assert.equal(graph.outputLabel,'aout');
  assert.match(filters,/amix=inputs=2:duration=longest.*\[voicebus\]/);
  assert.match(filters,/sidechaincompress=threshold=0\.05:ratio=8:attack=20:release=350/);
  assert.match(filters,/loudnorm=I=-14:TP=-1:LRA=11:linear=true/);
  assert.match(filters,/alimiter=limit=0\.891251/);
  assert.equal(graph.policy.sampleRate,48000);
});

test('does not invent ducking when there is no dialogue bus',()=>{
  const graph=buildAudioMasterGraph({
    durationSec:5,
    clips:[
      {label:'music-a',trackKind:'music'},
      {label:'sfx-a',trackKind:'sfx'},
    ],
  });
  const filters=graph.filters.join('');
  assert.doesNotMatch(filters,/sidechaincompress/);
  assert.match(filters,/loudnorm=/);
});

test('normalizes unsafe settings into bounded production values',()=>{
  const policy=normalizeAudioMasterPolicy({
    targetLufs:-100,
    truePeakDb:5,
    lra:100,
    duckRatio:99,
    attackMs:0,
    releaseMs:2,
    sampleRate:500000,
  });
  assert.equal(policy.targetLufs,-24);
  assert.equal(policy.truePeakDb,-.1);
  assert.equal(policy.lra,20);
  assert.equal(policy.duckRatio,20);
  assert.equal(policy.attackMs,1);
  assert.equal(policy.releaseMs,10);
  assert.equal(policy.sampleRate,96000);
});
