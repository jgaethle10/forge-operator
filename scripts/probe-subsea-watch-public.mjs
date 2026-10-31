import assert from 'node:assert/strict';
const base=String(process.env.SUBSEA_PAGES_ROOT||'').replace(/\/+$/,'');
if(!base.startsWith('https://'))throw Error('SUBSEA_PAGES_ROOT HTTPS deployment is required');
const root=base+'/subsea-watch/';
async function read(name){
 const url=root+name;let error;
 for(let n=0;n<8;n++){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Evercraft-Subsea-Watch-Canary/1.0'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   const value=await r.text();
   if(value.length<100)throw Error('Unexpectedly short body');
   console.log('SUBSEA_HTTP_OK '+r.status+' '+url+' ('+value.length+' bytes)');
   return value;
  }catch(e){error=e;if(n<7)await new Promise(ok=>setTimeout(ok,1800));}
 }
 throw Error('Public Subsea asset failed '+url+' : '+error?.message);
}
const names=['','core.mjs','viewer.mjs','sample.json','README.md'];
const contents=await Promise.all(names.map(read));
const [html,core,viewer,sampleText,readme]=contents;
assert.match(html,/Revisit the dive/);
assert.match(html,/Prototype, not a safety device/);
assert.match(html,/id="no-xy"/);
assert.match(html,/src="\.\/viewer\.mjs"/);
assert.match(core,/horizontal_position_unavailable/);
assert.match(core,/gap_not_interpolated/);
assert.match(viewer,/setDive\(await r\.json\(\)\)/);
assert.match(viewer,/from '\.\/core\.mjs'/);
assert.match(viewer,/parseInput/);
const sample=JSON.parse(sampleText);
assert.equal(sample.demo,true);
assert.equal(sample.position_source,'SIMULATED');
assert.equal(sample.points.length,37);
assert.match(readme,/not commercially validated/i);
console.log('SUBSEA_PUBLIC_HTTPS_SAMPLE_REPLAY_SOURCE_VERIFIED');
if(process.env.GITHUB_STEP_SUMMARY){
 const fs=await import('node:fs');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
 '\n## Subsea Watch experimental customer replay\n\n- **HTTPS checked**: '+root+'\n- Browser UI, parser, 3D viewer, synthetic sample and safety/readme checks passed.\n- Experimental only: not real diver telemetry, measured pipe geometry, certified hazard detection or safe-dive clearance.\n');
}
