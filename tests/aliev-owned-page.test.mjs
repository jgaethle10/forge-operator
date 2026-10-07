import assert from 'node:assert/strict';
import { renderAliEvLanding } from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const aliev=renderAliEvLanding();
assert.match(aliev,/AliEV is Evercraft's EV infrastructure intelligence and operating layer/);
assert.match(aliev,/Observed session intelligence/);
assert.doesNotMatch(aliev,/RIVET/i);

const runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',
  port:0,
  catalog:[],
  faieSurfaceEnabled:false
});
try{
  const alievResponse=await fetch(runtime.url+'/aliev');
  assert.equal(alievResponse.status,200);
  assert.match(await alievResponse.text(),/The engine behind/);

  const rivetResponse=await fetch(runtime.url+'/rivet');
  assert.equal(rivetResponse.status,404);

  const healthResponse=await fetch(runtime.url+'/health');
  assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();
  assert.equal(health.aliev_public_path,'/aliev');
  assert.equal(Object.hasOwn(health,'rivet_public_path'),false);
}finally{
  await runtime.close();
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev-owned-page-proof.v1',
  aliev_renderer_contract:true,
  aliev_owned_http_route:true,
  rivet_surface_withdrawn:true
},null,2));
