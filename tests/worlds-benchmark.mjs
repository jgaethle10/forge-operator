import {performance} from 'node:perf_hooks';import {initialWorld,applyCommand,stepAgents} from '../public/worlds/world-core.mjs';import {toEngineWorld} from '../public/worlds/world-bridge.mjs';
let w=initialWorld();for(let i=0;i<80;i++)w=applyCommand(w,`add ${['tree','flower','bench','lamp','rock','mushroom'][i%6]} at ${i%16-8}, ${Math.floor(i/16)-3}`).world;
const run=(label,fn,n=10000)=>{const t=performance.now();for(let i=0;i<n;i++)fn(i);const d=performance.now()-t;console.log(`${label}: ${(d/n*1000).toFixed(3)} us/op (${n} ops, ${d.toFixed(1)} ms)`);};
run('3 local scripted agents step',i=>stepAgents(w,1/60,i/60),30000);
run('export 80 objects to engine schema',()=>toEngineWorld(w),10000);
run('persist scene to JSON',()=>JSON.stringify(w),10000);
console.log('CAUTION: Node CPU microbenchmarks only. They DO NOT measure browser frame rate, GPU time, touch latency or cold page load.');