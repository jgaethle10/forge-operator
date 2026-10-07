import assert from 'node:assert/strict';
import { renderEarthWorksSimulator } from '../systemia/mcp/earthworks-simulator-page.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const html=renderEarthWorksSimulator();
assert.match(html,/EarthWorks Live Yard/);
assert.match(html,/Manual/);
assert.match(html,/Shadow/);
assert.match(html,/Autonomy/);
assert.match(html,/Inject road delay/);
assert.match(html,/Quarry digital twin/);
assert.match(html,/Simulation only/);
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
  assert.match(body,/earthworks-site-autonomy-study-v1/);
  const csp=response.headers.get('content-security-policy')||'';
  assert.match(csp,/script-src 'unsafe-inline'/);
  assert.match(csp,/connect-src 'none'/);

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
