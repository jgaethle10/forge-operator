import assert from 'node:assert/strict';
import { renderEarthWorksSimulator } from '../systemia/mcp/earthworks-simulator-page.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const html=renderEarthWorksSimulator();
assert.match(html,/EarthWorks Live Yard/);
assert.match(html,/Manual/);
assert.match(html,/Shadow/);
assert.match(html,/Autonomy/);
assert.match(html,/Inject road delay/);
assert.match(html,/Truck Queue/);
assert.match(html,/Loader Starvation/);
assert.match(html,/Blocked Route/);
assert.match(html,/Production Surge/);
assert.match(html,/STOP ALL/);
assert.match(html,/Quarry digital twin/);
assert.match(html,/Simulation only/);
assert.ok(html.includes('<script type="module" src="/earthworks/app.mjs"></script>'));
assert.doesNotMatch(html,/base44\.app/i);

const runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',
  port:0,
  catalog:[],
  faieSurfaceEnabled:false
});

try{
  const response=await fetch(runtime.url+'/earthworks');
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/Live Yard 001/);
  assert.match(body,/Dispatch truck/);
  assert.match(body,/Optimize loop/);
  assert.match(body,/Truck Queue/);
  assert.match(body,/Loader Starvation/);
  assert.match(body,/Blocked Route/);
  assert.match(body,/Production Surge/);
  assert.match(body,/STOP ALL/);
  assert.match(body,/earthworks-site-autonomy-study-v1/);
  const csp=response.headers.get('content-security-policy')||'';
  assert.match(csp,/script-src 'self'/);
  assert.doesNotMatch(csp,/script-src 'unsafe-inline'/);
  assert.match(csp,/connect-src 'none'/);

  const controllerModule=await fetch(runtime.url+'/earthworks/controller.mjs');
  assert.equal(controllerModule.status,200);
  assert.match(controllerModule.headers.get('content-type')||'',/application\/javascript/);
  const controllerSource=await controllerModule.text();
  assert.match(controllerSource,/export function createFleetController/);
  assert.match(controllerSource,/currentLoadTruckId/);
  assert.match(controllerSource,/STOP ALL/);

  const appModule=await fetch(runtime.url+'/earthworks/app.mjs');
  assert.equal(appModule.status,200);
  assert.match(appModule.headers.get('content-type')||'',/application\/javascript/);
  const appSource=await appModule.text();
  assert.match(appSource,/createFleetController/);
  assert.match(appSource,/canonical EarthWorks controller/i);
  assert.match(appSource,/truck\.state==='queue'/);
  assert.match(appSource,/truck\.state==='approach'/);
  assert.match(appSource,/truck\.state==='loading'/);
  assert.match(appSource,/truck\.state==='haul'/);
  assert.match(appSource,/truck\.state==='dump'/);
  assert.match(appSource,/truck\.state==='return'/);

  const slash=await fetch(runtime.url+'/earthworks/');
  assert.equal(slash.status,200);

  const health=await fetch(runtime.url+'/health').then(r=>r.json());
  assert.equal(health.earthworks_simulator_path,'/earthworks');
  assert.equal(health.earthworks_simulator_authority,'interactive_software_simulation_only');
}finally{
  await runtime.close();
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.earthworks.live-yard-owned-page-proof.v1',
  owned_http_route:true,
  interactive_controls:true,
  physical_machine_control:false
},null,2));
