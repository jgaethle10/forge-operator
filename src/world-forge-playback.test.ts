import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorldForgePlaybackClock,
  worldForgePlaybackTickBudget,
} from './world-forge-playback.js';

test('continuous playback converts wall-clock pacing into deterministic tick batches',()=>{
  const clock=createWorldForgePlaybackClock(1000);
  const oneX=worldForgePlaybackTickBudget({
    clock,
    nowMs:1100,
    tickRateHz:60,
    playbackRate:1,
  });
  assert.equal(oneX.ticks,6);
  assert.equal(oneX.droppedWholeTicks,0);

  const twoX=worldForgePlaybackTickBudget({
    clock:createWorldForgePlaybackClock(1000),
    nowMs:1050,
    tickRateHz:60,
    playbackRate:2,
  });
  assert.equal(twoX.ticks,6);
});

test('continuous playback preserves fractional ticks without inventing simulation time',()=>{
  const first=worldForgePlaybackTickBudget({
    clock:createWorldForgePlaybackClock(0),
    nowMs:10,
    tickRateHz:60,
    playbackRate:1,
  });
  assert.equal(first.ticks,0);
  assert.ok(first.clock.remainderTicks>.59&&first.clock.remainderTicks<.61);

  const second=worldForgePlaybackTickBudget({
    clock:first.clock,
    nowMs:20,
    tickRateHz:60,
    playbackRate:1,
  });
  assert.equal(second.ticks,1);
  assert.ok(second.clock.remainderTicks>.19&&second.clock.remainderTicks<.21);
});

test('continuous playback bounds tab-suspension catch-up rather than stampeding the runtime',()=>{
  const result=worldForgePlaybackTickBudget({
    clock:createWorldForgePlaybackClock(0),
    nowMs:60_000,
    tickRateHz:60,
    playbackRate:1,
    maxBatch:12,
    maxElapsedMs:500,
  });
  assert.equal(result.elapsedMs,500);
  assert.equal(result.ticks,12);
  assert.equal(result.droppedWholeTicks,18);
  assert.equal(result.clock.remainderTicks,0);
});

test('continuous playback rejects invalid playback rates',()=>{
  assert.throws(
    ()=>worldForgePlaybackTickBudget({
      clock:createWorldForgePlaybackClock(0),
      nowMs:100,
      tickRateHz:60,
      playbackRate:0,
    }),
    /world_forge_playback_rate_invalid/,
  );
});
