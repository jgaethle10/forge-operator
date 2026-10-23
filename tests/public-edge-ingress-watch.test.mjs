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
    now:Date.parse('2026-10-01T05:01:00.000Z'),
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
    external:{tcp_reachable:false,tls_reachable:false,http_reachable:false,source:'independent_canary',observed_at:new Date().toISOString()},
  });
  const decision=recoveryDecision(diagnosis,{outboundRelayAvailable:true,portMappingCapability:'upnp_verified'});
  assert.equal(decision.action,'activate_outbound_service_relay');
  assert.equal(decision.founder_action_required,false);
});

test('uses bounded port mapping only when a capability is explicitly verified',()=>{
  const diagnosis=classifyPublicEdgeIngress({
    local:{ok:true},
    dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:false,source:'independent_canary',observed_at:new Date().toISOString()},
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
      observed_at:new Date().toISOString(),
    }),
  });
  assert.equal(receipt.state,'public_ingress_verified');
  assert.equal(receipt.direct_ingress_ready,true);
  assert.equal(receipt.local_service_ok,true);
  assert.equal(receipt.dns_target_match,true);
});

test('partial TCP-only evidence cannot make the public origin green',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:true,tls_reachable:null,http_reachable:null,
      source:'independent_canary',observed_at:'2026-10-21T18:00:00.000Z'},
    now:Date.parse('2026-10-21T18:01:00.000Z'),
  });
  assert.equal(result.state,'external_probe_incomplete');
  assert.equal(result.direct_ingress_ready,false);
  assert.equal(result.evidence_complete,false);
  assert.equal(recoveryDecision(result).action,'hold');
});

test('TLS-only with unobserved HTTP is incomplete, not a valid route',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:true,tls_reachable:true,http_reachable:null,status:null,
      source:'independent_canary',observed_at:'2026-10-21T18:00:00.000Z'},
    now:Date.parse('2026-10-21T18:01:00.000Z'),
  });
  assert.equal(result.state,'external_probe_incomplete');
  assert.equal(result.direct_ingress_ready,false);
});

test('expired or future-dated external observations cannot authorize repair or readiness',()=>{
  const good={tcp_reachable:true,tls_reachable:true,http_reachable:true,status:200,
    source:'independent_canary',observed_at:'2026-10-21T18:00:00.000Z'};
  const base={local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    now:Date.parse('2026-10-21T18:06:00.000Z')};
  const stale=classifyPublicEdgeIngress({...base,external:good});
  assert.equal(stale.state,'external_probe_stale');
  assert.equal(stale.direct_ingress_ready,false);
  assert.equal(stale.evidence_complete,false);
  assert.equal(recoveryDecision(stale,{outboundRelayAvailable:true}).action,'hold');
  const future=classifyPublicEdgeIngress({...base,external:{
    ...good,observed_at:'2026-10-21T18:08:00.000Z'}});
  assert.equal(future.state,'external_probe_stale');
});

test('HTTP error responses block ingress promotion even when TCP and TLS pass',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:true,tls_reachable:true,http_reachable:true,status:503,
      source:'independent_canary',observed_at:'2026-10-21T18:00:00.000Z'},
    now:Date.parse('2026-10-21T18:00:30.000Z'),
  });
  assert.equal(result.state,'http_response_unhealthy');
  assert.equal(result.direct_ingress_ready,false);
});

test('unattributed positive observations cannot claim independent reachability',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:true,tls_reachable:true,http_reachable:true,status:200,
      observed_at:'2026-10-21T18:00:00.000Z'},
    now:Date.parse('2026-10-21T18:00:30.000Z'),
  });
  assert.equal(result.state,'external_probe_incomplete');
  assert.equal(result.direct_ingress_ready,false);
});

test('fresh complete externally supplied evidence allows classification but grants no router authority',()=>{
  const result=classifyPublicEdgeIngress({
    local:{ok:true},dns:{ok:true,addresses:['203.0.113.42']},
    external:{tcp_reachable:true,tls_reachable:true,http_reachable:true,status:200,
      source:'github_actions_external_canary',observed_at:'2026-10-21T18:00:00.000Z'},
    now:Date.parse('2026-10-21T18:01:00.000Z'),
  });
  assert.equal(result.state,'public_ingress_verified');
  assert.equal(result.direct_ingress_ready,true);
  assert.equal(result.evidence_complete,true);
  assert.equal(result.arbitrary_router_admin_allowed,false);
});
