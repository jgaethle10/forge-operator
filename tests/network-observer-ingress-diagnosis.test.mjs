import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseNodeIngress } from '../systemia/compute/network-observer.mjs';

const healthy={
  fabricLocal:{ok:true},
  edgeLocal:{ok:true},
  routerEnv:{
    EVERCRAFT_ROUTER_GATEWAY:'192.0.2.1',
    EVERCRAFT_ROUTER_LAN_HOST:'192.0.2.44',
  },
  services:{router_map_timer:{active:true}},
  chromeBoundary:{likely_crostini:true},
};

test('pinpoints ChromeOS host forwarding when router mapper cannot reach forwarded guest ports',()=>{
  const diagnosis=diagnoseNodeIngress({
    ...healthy,
    routerMapReceipt:{
      ok:false,
      state:'chromeos_host_forward_unreachable',
      host_forward_preflight:{ready:false,probes:[{port:18080,ok:false},{port:8443,ok:false}]},
      attempts:[],
    },
  });
  assert.equal(diagnosis.state,'chromeos_host_forward_unreachable');
  assert.equal(diagnosis.next_boundary,'chromeos_linux_port_forwarding');
});

test('separates host forwarding from router mapping protocol failure',()=>{
  const diagnosis=diagnoseNodeIngress({
    ...healthy,
    routerMapReceipt:{
      ok:false,
      host_forward_preflight:{ready:true},
      attempts:[
        {method:'UPnP-IGD',success:false},
        {method:'NAT-PMP',success:false},
        {method:'PCP',success:false},
      ],
    },
  });
  assert.equal(diagnosis.state,'router_port_mapping_failed');
  assert.equal(diagnosis.next_boundary,'upnp_nat_pmp_or_pcp_mapping');
});

test('requires independent external canary after local ingress chain is reasserted',()=>{
  const diagnosis=diagnoseNodeIngress({
    ...healthy,
    routerMapReceipt:{
      ok:true,
      method:'NAT-PMP',
      host_forward_preflight:{ready:true},
    },
  });
  assert.equal(diagnosis.state,'local_ingress_chain_reasserted_external_route_unverified');
  assert.equal(diagnosis.next_boundary,'independent_external_canary');
});

test('local TLS failure remains ahead of host/router diagnosis',()=>{
  const diagnosis=diagnoseNodeIngress({
    ...healthy,
    edgeLocal:{ok:false,error:'connection refused'},
    routerMapReceipt:{ok:false,host_forward_preflight:{ready:false}},
  });
  assert.equal(diagnosis.state,'local_https_edge_unhealthy');
});


test('uses paired ChromeOS observation to distinguish disabled settings from LAN failure',()=>{
  const settingOff=diagnoseNodeIngress({
    ...healthy,
    chromeBoundary:{
      likely_crostini:true,
      host_port_forwarding:{
        observed_by_paired_host_companion:true,
        ports:[
          {port:18080,protocol:'TCP',present:true,enabled:true},
          {port:8443,protocol:'TCP',present:true,enabled:false},
        ],
      },
    },
    routerMapReceipt:{
      ok:false,
      host_forward_preflight:{ready:false},
    },
  });
  assert.equal(settingOff.state,'chromeos_host_forward_setting_not_ready');

  const settingOnButUnreachable=diagnoseNodeIngress({
    ...healthy,
    chromeBoundary:{
      likely_crostini:true,
      host_port_forwarding:{
        observed_by_paired_host_companion:true,
        ports:[
          {port:18080,protocol:'TCP',present:true,enabled:true},
          {port:8443,protocol:'TCP',present:true,enabled:true},
        ],
      },
    },
    routerMapReceipt:{
      ok:false,
      host_forward_preflight:{ready:false},
    },
  });
  assert.equal(
    settingOnButUnreachable.state,
    'chromeos_host_forward_enabled_but_lan_unreachable'
  );
  assert.equal(
    settingOnButUnreachable.next_boundary,
    'chromeos_forwarder_runtime_firewall_or_lan_path'
  );
});
