export interface WorldForgePlaybackClock {
  lastMs:number;
  remainderTicks:number;
}

export interface WorldForgePlaybackBudget {
  clock:WorldForgePlaybackClock;
  ticks:number;
  elapsedMs:number;
  droppedWholeTicks:number;
}

export function createWorldForgePlaybackClock(nowMs:number):WorldForgePlaybackClock{
  if(!Number.isFinite(nowMs)) throw new Error('world_forge_playback_clock_invalid');
  return {lastMs:nowMs,remainderTicks:0};
}

export function worldForgePlaybackTickBudget(input:{
  clock:WorldForgePlaybackClock;
  nowMs:number;
  tickRateHz:number;
  playbackRate:number;
  maxBatch?:number;
  maxElapsedMs?:number;
}):WorldForgePlaybackBudget{
  if(!Number.isFinite(input.nowMs)) throw new Error('world_forge_playback_now_invalid');
  if(!Number.isFinite(input.clock.lastMs)) throw new Error('world_forge_playback_last_invalid');
  if(!Number.isFinite(input.clock.remainderTicks)||input.clock.remainderTicks<0||input.clock.remainderTicks>=1){
    throw new Error('world_forge_playback_remainder_invalid');
  }
  if(!Number.isFinite(input.tickRateHz)||input.tickRateHz<=0||input.tickRateHz>1000){
    throw new Error('world_forge_playback_tick_rate_invalid');
  }
  if(!Number.isFinite(input.playbackRate)||input.playbackRate<=0||input.playbackRate>4){
    throw new Error('world_forge_playback_rate_invalid');
  }

  const maxBatch=Math.max(1,Math.min(600,Math.floor(input.maxBatch??30)));
  const maxElapsedMs=Math.max(16,Math.min(2000,input.maxElapsedMs??500));
  const elapsedMs=Math.max(0,Math.min(maxElapsedMs,input.nowMs-input.clock.lastMs));
  const rawTicks=
    input.clock.remainderTicks+
    elapsedMs/1000*input.tickRateHz*input.playbackRate;
  const wholeTicks=Math.max(0,Math.floor(rawTicks));
  const ticks=Math.min(maxBatch,wholeTicks);
  const droppedWholeTicks=Math.max(0,wholeTicks-ticks);
  const remainderTicks=rawTicks-wholeTicks;

  return {
    ticks,
    elapsedMs,
    droppedWholeTicks,
    clock:{
      lastMs:input.nowMs,
      remainderTicks,
    },
  };
}
