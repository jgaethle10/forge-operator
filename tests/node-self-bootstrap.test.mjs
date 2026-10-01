import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBootstrap } from '../systemia/compute/node-self-bootstrap.mjs';

const bootA='sha256:'+'a'.repeat(64);
const bootB='sha256:'+'b'.repeat(64);
const fingerprint='sha256:'+'c'.repeat(64);

function baseFiles(){
  return {
    preflight:{passed:true},
    install:{install_boot_id_hash:bootA,remote_admission_service:'evercraft-remote-admission.service',bind_host:'127.0.0.1',outbound_only:true},
    node:{node_id:'evercraft-field-01',device_fingerprint:fingerprint,endpoint:'http://192.168.1.50:42420'},
    offline:{verified:true},
    field:{ready_for_yard_enrollment:true},
    public_edge:{
      ready_for_public_edge_enrollment:true,
      runtime_advertisement_verified:true,
      public_edge_configuration_valid:true,
      base_domain:'edge.example.test',
      public_port:443,
      certificate_fingerprint256:'AA:BB',
      external_dns_verified:false,
      public_reachability_verified:false,
    },
  };
}

test('ineligible machine is rejected rather than weakened into public edge',()=>{
  const files=baseFiles();
  files.preflight={passed:false};
  const s=evaluateBootstrap({files,currentBootHash:bootB});
  assert.equal(s.state,'ineligible_for_field_public_edge');
  assert.equal(s.next_action,'use_another_owned_machine');
  assert.equal(s.human_action_required,true);
});

test('fresh eligible machine advances to install without inventing a human gate',()=>{
  const files=baseFiles();
  files.install=null;
  files.node=null;
  files.offline=null;
  files.field=null;
  files.public_edge=null;
  const s=evaluateBootstrap({files,currentBootHash:bootA});
  assert.equal(s.state,'install_ready');
  assert.equal(s.human_action_required,false);
});

test('installed machine requires one real reboot before field certification',()=>{
  const files=baseFiles();
  files.offline=null;
  files.field=null;
  files.public_edge=null;
  const s=evaluateBootstrap({files,currentBootHash:bootA});
  assert.equal(s.state,'reboot_required');
  assert.equal(s.human_action_required,true);
});

test('post-reboot machine requires an actual offline survival receipt',()=>{
  const files=baseFiles();
  files.offline=null;
  files.field=null;
  files.public_edge=null;
  const s=evaluateBootstrap({files,currentBootHash:bootB});
  assert.equal(s.state,'offline_check_required');
  assert.equal(s.next_action,'disconnect_network_then_run_--capture-offline');
});

test('field certification never self-asserts a physical host',()=>{
  const files=baseFiles();
  files.field=null;
  files.public_edge=null;
  const s=evaluateBootstrap({
    files,currentBootHash:bootB,physicalConfirmed:false,
  });
  assert.equal(s.state,'physical_confirmation_required');
  assert.equal(s.human_action_required,true);
});

test('certified node without trusted public HTTPS is not promoted',()=>{
  const files=baseFiles();
  files.public_edge=null;
  const s=evaluateBootstrap({
    files,currentBootHash:bootB,physicalConfirmed:true,
  });
  assert.equal(s.state,'public_https_admission_required');
  assert.equal(s.human_action_required,false);
});

test('public edge with no Systemia broker is explicit, not silently complete',()=>{
  const files=baseFiles();
  const s=evaluateBootstrap({
    files,currentBootHash:bootB,physicalConfirmed:true,brokerUrl:'',
  });
  assert.equal(s.state,'control_broker_binding_required');
  assert.equal(s.human_action_required,false);
});

test('all local field gates plus broker binding reach Systemia admission state',()=>{
  const files=baseFiles();
  const s=evaluateBootstrap({
    files,currentBootHash:bootB,physicalConfirmed:true,
    brokerUrl:'https://fabric-control.example.test',
  });
  assert.equal(s.state,'ready_for_systemia_admission');
  assert.equal(s.human_action_required,false);
  assert.equal(s.node_id,'evercraft-field-01');
  assert.equal(s.device_fingerprint,fingerprint);
});


test('private worker skips public edge and needs only outbound broker after field proof',()=>{
  const files=baseFiles();
  files.public_edge=null;
  const status=evaluateBootstrap({
    files,
    currentBootHash:bootB,
    physicalConfirmed:true,
    brokerUrl:'https://fabric-control.example.test',
    nodeRole:'private_worker',
  });
  assert.equal(status.state,'ready_for_systemia_admission');
  assert.equal(status.node_role,'private_worker');
  assert.equal(status.public_edge_required,false);
  assert.equal(status.inbound_public_port_required,false);
  assert.equal(status.outbound_only_eligible,true);
});

test('private worker with legacy install must add persistent outbound service before admission',()=>{
  const files=baseFiles();
  files.public_edge=null;
  delete files.install.remote_admission_service;
  const status=evaluateBootstrap({
    files,
    currentBootHash:bootB,
    physicalConfirmed:true,
    brokerUrl:'https://fabric-control.example.test',
    nodeRole:'private_worker',
  });
  assert.equal(status.state,'outbound_agent_install_required');
  assert.equal(status.human_action_required,false);
  assert.equal(status.next_action,'rerun_bootstrap_with_--advance_to_install_persistent_outbound_agent');
});

test('private worker without broker holds for outbound control but never asks for TLS',()=>{
  const files=baseFiles();
  files.public_edge=null;
  const status=evaluateBootstrap({
    files,
    currentBootHash:bootB,
    physicalConfirmed:true,
    brokerUrl:'',
    nodeRole:'private_worker',
  });
  assert.equal(status.state,'control_broker_binding_required');
  assert.equal(status.public_edge_required,false);
  assert.notEqual(status.next_action,'bind_owned_domain_and_trusted_tls_then_run_--admit-public-edge');
});

test('operator-authorized Chromebook edge requires public HTTPS but skips physical Node 001 gates',()=>{
  const files=baseFiles();
  files.offline=null;
  files.field=null;
  files.public_edge=null;
  const pending=evaluateBootstrap({
    files,
    currentBootHash:bootA,
    physicalConfirmed:false,
    brokerUrl:'https://fabric-control.example.test',
    nodeRole:'operator_authorized_public_edge',
  });
  assert.equal(pending.state,'public_https_admission_required');
  assert.equal(pending.next_action,'run_operator_edge_external_canary_then_admit');
  assert.equal(pending.public_edge_required,true);
  assert.equal(pending.public_ingress_required,true);
  assert.equal(pending.inbound_public_port_required,false);
  assert.equal(pending.chromeos_forwarded_high_port_edge,true);
  assert.equal(pending.physical_certification_required,false);
  assert.equal(pending.trust_class,'operator_authorized_public_edge');

  files.public_edge={
    ready_for_public_edge_enrollment:true,
    runtime_advertisement_verified:true,
    public_edge_configuration_valid:true,
    base_domain:'fabric.systemiacommandcenters.com',
    public_port:443,
    certificate_fingerprint256:'AA:BB',
    external_dns_verified:true,
    public_reachability_verified:true,
  };
  const ready=evaluateBootstrap({
    files,
    currentBootHash:bootA,
    physicalConfirmed:false,
    brokerUrl:'https://fabric-control.example.test',
    nodeRole:'operator_authorized_public_edge',
  });
  assert.equal(ready.state,'ready_for_systemia_admission');
  assert.equal(ready.human_action_required,false);
  assert.equal(ready.trust_class,'operator_authorized_public_edge');
});

test('public edge role still requires trusted public HTTPS',()=>{
  const files=baseFiles();
  files.public_edge=null;
  const status=evaluateBootstrap({
    files,
    currentBootHash:bootB,
    physicalConfirmed:true,
    brokerUrl:'https://fabric-control.example.test',
    nodeRole:'public_edge',
  });
  assert.equal(status.state,'public_https_admission_required');
  assert.equal(status.public_edge_required,true);
  assert.equal(status.inbound_public_port_required,true);
});

test('invalid node role is rejected',()=>{
  assert.throws(
    ()=>evaluateBootstrap({files:baseFiles(),currentBootHash:bootB,nodeRole:'mystery'}),
    /node_role_invalid/
  );
});
