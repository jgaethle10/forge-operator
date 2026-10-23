import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectNextGen} from './nextgen-remote-doctor.mjs';

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-nextgen-proof-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}
const wsl={platform:'linux',release:'6.6.0-microsoft-standard-WSL2',nodeVersion:'22.16.0',userSystemd:true};

test('missing private broker is a hold; no remote control invented',t=>{
  const r=inspectNextGen({...wsl,home:tempHome(t)});
  assert.equal(r.is_linux_wsl,true);
  assert.equal(r.next_action,'configure_verified_evercraft_broker_origin_privately');
  assert.equal(r.ready_for_remote_install,false);
  assert.equal(r.owner_permission_minted,false);
});
test('startup remote admission receipt is NOT authenticated live MCP control',t=>{
  const home=tempHome(t);
  const conf=path.join(home,'.config/evercraft');fs.mkdirSync(conf,{recursive:true});
  fs.writeFileSync(path.join(conf,'local-organism.env'),
    'EVERCRAFT_REMOTE_BROKER_URL=https://private-broker.example.test\nPRIVATE_KEY=should-not-print');
  const dir=path.join(home,'.local/state/evercraft/organism');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'local-organism-receipt.json'),JSON.stringify({
    remote_operator:{enabled:true,root_keys:['home']},
    remote_admission:{state:'connected'}}));
  const r=inspectNextGen({...wsl,home});
  assert.equal(r.remote_operator_locally_enabled,true);
  assert.equal(r.remote_admission_startup_claim,'connected_at_startup_unverified_currently');
  assert.equal(r.trusted_mcp_control_session_verified,false);
  assert.equal(r.ready_for_remote_install,false);
  assert.doesNotMatch(JSON.stringify(r),/private-broker|should-not-print/);
});
test('shadow agent presence does not authorize remote jobs',t=>{
  const home=tempHome(t),dir=path.join(home,'.local/share/evercraft/node002-agent/app');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'node002-agent.mjs'),'// shadow');
  const r=inspectNextGen({...wsl,home,brokerUrl:'http://untrusted.example.test'});
  assert.equal(r.node002_shadow_agent_present,true);
  assert.equal(r.verified_broker_origin_configured,false);
  assert.equal(r.ready_for_remote_install,false);
});
test('host/runtime prerequisites fail closed',t=>{
  const home=tempHome(t);
  assert.equal(inspectNextGen({...wsl,home,release:'linux-generic'}).next_action,
    'run_this_preflight_inside_nextgen_wsl');
  assert.equal(inspectNextGen({...wsl,home,nodeVersion:'20.2.0'}).next_action,
    'install_node_22_plus_on_nextgen_wsl');
  assert.equal(inspectNextGen({...wsl,home,userSystemd:false}).next_action,
    'enable_or_repair_user_systemd_in_wsl');
});
