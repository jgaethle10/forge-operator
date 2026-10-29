import { performance } from 'node:perf_hooks';
import {seedState,agentAt,residents,validateState} from '../public/worlds/state.mjs';
const s=seedState(), loops=10000, start=performance.now();
for(let i=0;i<loops;i++){for(const r of residents)agentAt(r,i/60);validateState(s)}
const elapsedMs=performance.now()-start;
console.log(JSON.stringify({schema:'evercraft.worlds.cpu-benchmark.v1',validationLoops:loops,agentPositions:loops*residents.length,elapsedMs:+elapsedMs.toFixed(2),meanCpuMsPerLoop:+(elapsedMs/loops).toFixed(5),warning:'CPU microbenchmark only, not browser FPS, GPU performance, mobile latency or production load time'},null,2));
