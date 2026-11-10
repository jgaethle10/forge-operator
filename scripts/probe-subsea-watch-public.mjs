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
const names=['','core.mjs','viewer.mjs','sample.json','README.md','immersive/','immersive/scene.mjs','immersive/video-sync.mjs','field-archive/','field-archive/catalog.mjs','field-archive/sources.json'];
const contents=await Promise.all(names.map(read));
const [html,core,viewer,sampleText,readme,immersive,scene,videoSync,fieldArchive,fieldScript,fieldSourcesText]=contents;
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
assert.match(immersive,/Enter the <em>deep/);
assert.match(immersive,/Synthetic demonstration/);
assert.match(immersive,/NOT DIVE CLEARANCE/);
assert.match(immersive,/src="\.\/scene\.mjs"/);
assert.match(scene,/getContext\('webgl'/);
assert.match(scene,/THIS ENTIRE ENVIRONMENT IS SYNTHETIC/);
assert.match(scene,/sample\.positionSource!=='SIMULATED'/);
assert.match(immersive,/id="footage-panel"/);
assert.match(immersive,/id="dive-video"/);
assert.match(immersive,/id="video-offset"/);
assert.match(immersive,/id="load-video"/);
assert.match(immersive,/playsinline preload="metadata" muted/);
assert.match(scene,/videoAtMissionTime\(current,videoStart/);
assert.match(scene,/URL\.createObjectURL\(file\)/);
assert.match(scene,/URL\.revokeObjectURL\(videoUrl\)/);
assert.match(scene,/if\(mode!=='imported'\)/);
assert.match(videoSync,/export function parseVideoStart\(/);
assert.match(videoSync,/export function videoAtMissionTime\(/);
assert.match(readme,/Local footage \/ mission clock pairing/);
assert.match(immersive,/href="\.\.\/field-archive\/"/);
assert.match(fieldArchive,/Kodiak Seep/);
assert.match(fieldArchive,/NOT synchronized/);
assert.match(fieldArchive,/id="start-preview"/);
assert.match(fieldArchive,/noindex,nofollow/);
assert.match(fieldScript,/fetch\('\.\/sources\.json'/);
assert.match(fieldScript,/player\.src=videoSource/);
const fieldSources=JSON.parse(fieldSourcesText);
assert.equal(fieldSources.schema,'evercraft.subsea.field_sources.v1');
assert.equal(fieldSources.mission.id,'EX2306_DIVE02');
assert.equal(fieldSources.mission.reconstruction_status,'NOT_RECONSTRUCTED');
assert.equal(fieldSources.mission.alignment_status,'UNVERIFIED_NO_SYNC');
assert.equal(fieldSources.entries.length,6);

console.log('SUBSEA_PUBLIC_HTTPS_WEBGL_LOCAL_FOOTAGE_AND_NOAA_ARCHIVE_VERIFIED');
if(process.env.GITHUB_STEP_SUMMARY){
 const fs=await import('node:fs');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
 '\n## Subsea Watch experimental customer replay\n\n- **HTTPS checked**: '+root+'\n- Browser UI, parser, 3D viewer, synthetic sample, local video clock module, footage UI/privacy wiring, NOAA source registry and evidence-limit checks passed.\n- Experimental only: not real diver telemetry, measured pipe geometry, certified hazard detection or safe-dive clearance.\n');
}
