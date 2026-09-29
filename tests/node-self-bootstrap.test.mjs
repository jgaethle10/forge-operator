import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBootstrap } from '../systemia/compute/node-self-bootstrap.mjs';

const bootA='sha256:'+'a'.repeat(64);
const bootB='sha256:'+'b'.repeat(64);
const fingerprint='sha256:'+'c'.repeat(64);

function baseFiles(){
  return {
    preflight:{passed:true},
    install:{install_boot_id_hash:bootA},
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
