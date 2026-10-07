import assert from 'node:assert/strict';
import { renderRivetLanding, renderAliEvLanding } from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const rivet=renderRivetLanding();
assert.match(rivet,/One address\./);
assert.match(rivet,/RIVET is the reporting brand/);
assert.match(rivet,/\$299 one-time/);
assert.match(rivet,/\$750 one-time/);
assert.match(rivet,/href="\/aliev"/);

const aliev=renderAliEvLanding();
assert.match(aliev,/AliEV is Evercraft's EV infrastructure intelligence and operating layer/);
assert.match(aliev,/Observed session intelligence/);
assert.match(aliev,/href="\/rivet"/);

const runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',
  port:0,
  catalog:[],
  faieSurfaceEnabled:false
});
try{
  const rivetResponse=await fetch(runtime.url+'/rivet');
  assert.equal(rivetResponse.status,200);
  assert.match(await rivetResponse.text(),/One decision-ready report/);

  const alievResponse=await fetch(runtime.url+'/aliev');
  assert.equal(alievResponse.status,200);
  assert.match(await alievResponse.text(),/The engine behind/);

  const healthResponse=await fetch(runtime.url+'/health');
  assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();
  assert.equal(health.rivet_public_path,'/rivet');
  assert.equal(health.aliev_public_path,'/aliev');
}finally{
  await runtime.close();
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet-aliev-owned-pages-proof.v1',
  renderer_contract:true,
  owned_http_routes:true,
  health_paths_declared:true
},null,2));
