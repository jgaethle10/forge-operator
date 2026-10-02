import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPublicEdgeIngress,
  observePublicEdgeIngress,
  recoveryDecision,
} from '../systemia/network/public-edge-ingress-watch.mjs';

test('classifies healthy local service plus correct DNS plus external TCP timeout as NAT/firewall ingress block',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true,status:200},
    dns:{ok:true,addresses:['203.0.113.42']},
    expectedAddresses:['203.0.113.42'],
    external:{
      state:'tcp_timeout',
      tcp_reachable:false,
      tls_reachable:false,
      http_reachable:false,
      source:'independent_canary',
      observed_at:'2026-10-01T05:00:00.000Z',
    },
  });
  assert.equal(result.state,'nat_or_firewall_ingress_blocked');
  assert.equal(result.local_service_ok,true);
  assert.equal(result.dns_ok,true);
  assert.equal(result.dns_target_match,true);
  assert.equal(result.direct_ingress_ready,false);
  assert.equal(result.outbound_service_relay_preferred,true);
  assert.equal(result.arbitrary_router_admin_allowed,false);
});

test('prefers existing outbound service relay over router mutation',()=>{
  const diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:false,tls_reachable:false,http_reachable:false},
  });
  const decision=recoveryDecision(diagnosis,{outboundRelayAvailable:true,portMappingCapability:'upnp_verified'});
  assert.equal(decision.action,'activate_outbound_service_relay');
  assert.equal(decision.founder_action_required,false);
});

test('uses bounded port mapping only when a capability is explicitly verified',()=>{
  const diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:false},
  });
  assert.equal(
    recoveryDecision(diagnosis,{outboundRelayAvailable:false,portMappingCapability:'unknown'}).action,
    'hold'
  );
  const bounded=recoveryDecision(diagnosis,{outboundRelayAvailable:false,portMappingCapability:'nat_pmp_verified'});
  assert.equal(bounded.action,'repair_bounded_port_mapping');
  assert.equal(bounded.arbitrary_router_admin_allowed,false);
});

test('does not call direct ingress healthy without an independent external observation',()=>{
  const diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{ok:true,addresses:['203.0.113.42']},
    external:null,
  });
  assert.equal(diagnosis.state,'external_probe_required');
  assert.equal(diagnosis.direct_ingress_ready,false);
  assert.equal(diagnosis.evidence_complete,false);
});

test('observation keeps local DNS and external evidence separate',async()=>{
  const receipt=await observePublicEdgeIngress({
    publicOrigin:'https://fabric.example.test',
    localHealthUrl:'http://127.0.0.1:8787/health',
    expectedAddresses:['203.0.113.42'],
    localProbe:async()=>({ok:true,status:200,service:'evercraft-fabric-local'}),
    dnsProbe:async()=>({ok:true,addresses:['203.0.113.42']}),
    externalProbe:async()=>({
      tcp_reachable:true,
      tls_reachable:true,
      http_reachable:true,
      status:200,
      source:'systemia-independent-canary',
    }),
  });
  assert.equal(receipt.state,'public_ingress_verified');
  assert.equal(receipt.direct_ingress_ready,true);
  assert.equal(receipt.local_service_ok,true);
  assert.equal(receipt.dns_target_match,true);
});
