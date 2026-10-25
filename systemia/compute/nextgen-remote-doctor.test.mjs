import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectNextGen,consistentNextGenLocalReceipts,nextGenPrerequisiteStatus} from './nextgen-remote-doctor.mjs';

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-nextgen-proof-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}
const wsl={platform:'linux',release:'6.6.0-microsoft-standard-WSL2',nodeVersion:'22.16.0',userSystemd:true};

test('missing private broker is a hold; no remote control invented',t=>{
  const r=inspectNextGen({...wsl,home:tempHome(t)});
  assert.equal(r.is_linux_wsl,true);
  assert.equal(r.next_action,'inspect_or_stage_local_organism_under_owner_authorization');
  assert.equal(r.local_prerequisites_passed,true);
  assert.equal(r.local_foundation_receipts_consistent,false);
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
  const fp='sha256:'+'a'.repeat(64);
  fs.writeFileSync(path.join(dir,'local-organism-receipt.json'),JSON.stringify({
    schema:'evercraft.local-organism-receipt.v1',
    node_id:'evercraft-node002-nextgen',
    device_fingerprint:fp,
    public_ingress:false,
    node_endpoint_scope:'loopback_only',
    remote_operator:{enabled:true,root_keys:['home']},
    remote_admission:{state:'connected'}}));
  fs.mkdirSync(path.join(dir,'compute'),{recursive:true});
  fs.writeFileSync(path.join(dir,'compute/nodeseed-receipt.json'),JSON.stringify({
    schema:'evercraft.compute.nodeseed-receipt.v1',
    node_id:'evercraft-node002-nextgen',
    device_fingerprint:fp,
    endpoint:'http://127.0.0.1:45111',
    beacon:null,
  }));
  const r=inspectNextGen({...wsl,home});
  assert.equal(r.local_foundation_receipts_consistent,true);
  assert.equal(r.local_live_process_health_verified,false);
  assert.equal(r.local_prerequisites_passed,true);
  assert.equal(r.live_remote_control_verified,false);
  assert.equal(r.remote_operator_locally_enabled,true);
  // An HTTPS-shaped string and an old receipt cannot establish server trust.
  assert.equal(r.private_https_broker_url_configured,true);
  assert.equal(r.verified_broker_origin_configured,false);
  assert.equal(r.next_action,'verify_broker_origin_and_yard_provenance_out_of_band');
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
  assert.equal(r.private_https_broker_url_configured,false);
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

test('consistent NextGen identity and loopback receipts are distinct from live remote authority',()=>{
  const fp='sha256:'+'b'.repeat(64);
  const local={schema:'evercraft.local-organism-receipt.v1',
    node_id:'evercraft-node002-nextgen',device_fingerprint:fp,
    public_ingress:false,node_endpoint_scope:'loopback_only'};
  const seed={schema:'evercraft.compute.nodeseed-receipt.v1',
    node_id:'evercraft-node002-nextgen',device_fingerprint:fp,
    endpoint:'http://127.0.0.1:44001',beacon:null};
  assert.equal(consistentNextGenLocalReceipts(local,seed),true);
  for(const mutation of [
    {node_id:'node001'}, {device_fingerprint:'sha256:'+'f'.repeat(64)},
    {endpoint:'http://192.168.1.5:44001'},
    {endpoint:'https://public.example.test'},
    {endpoint:'http://127.0.0.1:44001?auth=secret'},
    {beacon:{}},
  ]) assert.equal(consistentNextGenLocalReceipts(local,{...seed,...mutation}),false);
  for(const mutation of [{public_ingress:true},{node_endpoint_scope:'public'},
    {node_id:'different'},{device_fingerprint:'sha256:'+'f'.repeat(64)}])
    assert.equal(consistentNextGenLocalReceipts({...local,...mutation},seed),false);
});

test('local prerequisites can pass without broker, remote still fails without independent attestation',()=>{
  const report={
    is_linux_wsl:true,node_22_or_newer:true,systemd_user_available:true,
    local_foundation_receipts_consistent:true,
    verified_broker_origin_configured:false,
    remote_device_trust_observed:false,
    trusted_mcp_control_session_verified:false,
    remote_operator_locally_enabled:false,
  };
  let decision=nextGenPrerequisiteStatus(report);
  assert.equal(decision.local_prerequisites_passed,true);
  assert.equal(decision.local_foundation_receipts_consistent,true);
  assert.equal(decision.live_remote_control_verified,false);
  decision=nextGenPrerequisiteStatus({...report,is_linux_wsl:false});
  assert.equal(decision.local_prerequisites_passed,false);
  assert.equal(decision.local_foundation_receipts_consistent,false);
});
