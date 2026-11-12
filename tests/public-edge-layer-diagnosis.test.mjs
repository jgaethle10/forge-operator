import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseExternalEdgeLayers} from '../systemia/network/public-edge-layer-diagnosis.mjs';

const partial={
 checks:{public_dns:true,public_tcp_443:true,trusted_tls:true,customer_surface:true,
   aliev_surface:true,journal_surface:false},
 publicTcp:{https_443:{reachable:true}},
 failureStage:'journal_surface',
 error:'journal_live_edition_missing'
};
test('journal live-edition failure does not pretend public DNS/TLS are down',()=>{
 const d=diagnoseExternalEdgeLayers(partial);
 assert.equal(d.state,'transport_verified_product_failed');
 assert.equal(d.public_transport_verified,true);
 assert.equal(d.composite_product_verified,false);
 assert.equal(d.layers.trusted_tls,'verified');
 assert.equal(d.layers.public_http_root,'verified');
 assert.equal(d.layers.journal_surface,'failed');
 assert.equal(d.failure_domain,'journal_publication');
 assert.equal(d.recommended_next,'inspect_journal_index_and_publication_receipts');
 assert.equal(d.router_mutation_authorized,false);
 assert.equal(d.local_resident_node_health_verified,false);
});
test('an HTTP or DNS failure cannot be promoted using a healthy TLS hint',()=>{
 const d=diagnoseExternalEdgeLayers({
  checks:{public_dns:false,trusted_tls:true,customer_surface:false},
  failureStage:'public_dns',error:'ENOTFOUND',
 });
 assert.equal(d.state,'public_transport_unverified');
 assert.equal(d.layers.public_dns,'failed');
 assert.equal(d.composite_product_verified,false);
});
test('a TCP failure is not a reason to claim global service outage',()=>{
 const d=diagnoseExternalEdgeLayers({
  checks:{public_dns:true,public_tcp_443:false},
  publicTcp:{https_443:{reachable:false}},
  failureStage:'public_tcp_tls_ingress',
 });
 assert.equal(d.layers.public_tcp_443,'failed');
 assert.equal(d.public_transport_verified,false);
 assert.equal(d.can_restart_public_edge,false);
 assert.equal(d.recommended_next,'compare_external_canary_with_resident_node_observation');
});
test('TLS can pass yet root HTTP can fail independently',()=>{
 const d=diagnoseExternalEdgeLayers({
  checks:{public_dns:true,public_tcp_443:true,trusted_tls:true,customer_surface:false},
  failureStage:'customer_surface',error:'http_502:/',
 });
 assert.equal(d.layers.trusted_tls,'verified');
 assert.equal(d.layers.public_http_root,'failed');
 assert.equal(d.public_transport_verified,false);
});
test('verified transport without product proofs is not a full release',()=>{
 const d=diagnoseExternalEdgeLayers({
  checks:{public_dns:true,public_tcp_443:true,trusted_tls:true,customer_surface:true},
 });
 assert.equal(d.state,'transport_verified_product_unverified');
 assert.equal(d.composite_product_verified,false);
});
test('only complete positive composite canary produces full contract state',()=>{
 const d=diagnoseExternalEdgeLayers({
  checks:{public_dns:true,public_tcp_443:true,trusted_tls:true,customer_surface:true,
    journal_surface:true,runtime_health:true,mcp_tools:true,device_attestation:true},
  compositeVerified:true,
 });
 assert.equal(d.state,'full_contract_verified');
 assert.equal(d.composite_product_verified,true);
 assert.equal(d.router_mutation_authorized,false);
});
test('unobserved layers remain unverified rather than failed or green',()=>{
 const d=diagnoseExternalEdgeLayers({});
 assert.equal(d.state,'public_transport_unverified');
 assert.equal(d.layers.journal_surface,'unverified');
 assert.equal(d.layers.trusted_tls,'unverified');
 assert.equal(d.failure_domain,'none_observed');
});
