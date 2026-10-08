import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileFirstOfferIngress,renderFirstOfferIngressTriage} from './first-offer-ingress-triage.mjs';
import {OFFER_ONE_URL} from './first-offer-external-probe.mjs';

const NOW='2026-10-08T02:45:00Z';
const external=(more={})=>({
 schema:'evercraft.systemia.offer-one.external-buyer-probe.v1',
 checked_at:'2026-10-08T02:40:00Z',
 checked_from:'independent_http_client',
 url:OFFER_ONE_URL,
 state:'held',verified:false,
 ingress:{dns:'resolved',ipv4_count:1,tcp_443:'timeout'},
 reason:'public_tcp_443_unreachable',
 ...more,
});
const doctor=(more={})=>({
 schema:'evercraft.fabric-edge-doctor.v1',
 domain:'fabric.systemiacommandcenters.com',
 observed_at:'2026-10-08T02:41:00Z',
 router_refresh_requested:false,
 local_fabric_ok:true,
 local_edge_https_listener_ok:true,
 dns_ipv4:'203.0.113.1',public_ipv4_seen_inside:'203.0.113.1',
 ingress_transport:'direct_chromeos_router',
 ...more,
});
const check=(e,d)=>reconcileFirstOfferIngress({external:e,doctor:d,now:NOW});

test('missing local doctor never asserts NAT: exact independent TCP 443 timeout reported',()=>{
 const r=check(external(),null);
 assert.equal(r.diagnosis,'public_443_unreachable_local_state_unknown');
 assert.equal(r.next_action,'collect_fresh_unmodified_local_fabric_edge_doctor_receipt');
 assert.equal(r.evidence.external_tcp_443,'timeout');
 assert.equal(r.evidence.local_doctor_usable,false);
 assert.equal(r.public_offer_release_verified,false);
 assert.equal(r.provider_checkout_verified,false);
 assert.equal(r.settled_customer_payment_verified,false);
});

test('locally unhealthy Fabric is more immediate than a router hypothesis',()=>{
 const r=check(external(),doctor({local_fabric_ok:false}));
 assert.equal(r.diagnosis,'local_fabric_unhealthy');
 assert.equal(r.next_action,'diagnose_local_127_0_0_1_8787_service_before_external_mapping');
});
test('a failed local HTTPS listener is diagnosed before ChromeOS forwarding',()=>{
 const r=check(external(),doctor({local_edge_https_listener_ok:false}));
 assert.equal(r.diagnosis,'local_https_8443_listener_unhealthy');
});
test('public and resolved address mismatches remain inspection-only holds',()=>{
 const r=check(external(),doctor({dns_ipv4:'203.0.113.7'}));
 assert.equal(r.diagnosis,'dns_to_public_ip_mismatch');
 assert.equal(r.no_router_dns_firewall_mutation,true);
});
test('a healthy private service cannot prove public ChromeOS, router or ISP ingress',()=>{
 const r=check(external(),doctor());
 assert.equal(r.diagnosis,'public_443_blocked_beyond_healthy_local_listeners');
 assert.ok(r.candidate_causes.includes('chromeos_forwarding'));
 assert.equal(r.public_offer_release_verified,false);
});
test('existing outbound relay is verified separately, never assumed from active process',()=>{
 const r=check(external(),doctor({ingress_transport:'outbound_service_relay'}));
 assert.equal(r.diagnosis,'public_relay_path_unverified');
 assert.equal(r.no_deployment_authority,true);
});
test('stale local doctor, unrecognized source or one that refreshed router mappings cannot be trusted as read-only',()=>{
 for(const d of [
  doctor({observed_at:'2026-10-01T02:41:00Z'}),
  doctor({domain:'not-evercraft.example'}),
  doctor({router_refresh_requested:true}),
  doctor({router_refresh_requested:undefined}),
 ]){
  const r=check(external(),d);
  assert.equal(r.diagnosis,'public_443_unreachable_local_state_unknown');
  assert.equal(r.evidence.local_doctor_usable,false);
 }
});
test('an expired, spoofed or wrong-origin external probe cannot override local proof',()=>{
 for(const e of [
  external({checked_at:'2026-09-30T02:40:00Z'}),
  external({url:'https://attacker.example/offers/ibmi-74-deadline-xray'}),
  external({checked_from:'self_declared'}),
  external({schema:'unknown'}),
 ]){
  const r=check(e,doctor());
  assert.equal(r.diagnosis.startsWith('external_probe_'),true);
  assert.equal(r.public_offer_release_verified,false);
 }
});
test('DNS failure precedes TCP classification, open TCP still does not prove TLS',()=>{
 const dns=check(external({ingress:{dns:'error',tcp_443:'not_tested'}}),doctor());
 assert.equal(dns.diagnosis,'public_dns_unresolved');
 const tcp=check(external({ingress:{dns:'resolved',tcp_443:'reachable'}}),doctor());
 assert.equal(tcp.diagnosis,'public_tcp_open_but_http_or_tls_unproved');
});
test('even a verified public page GET is not a live checkout or paid order',()=>{
 const r=check(external({state:'externally_verified_buyer_page',verified:true,reason:'page_identity_price_and_form_visible'}),doctor());
 assert.equal(r.diagnosis,'buyer_page_get_visible');
 assert.equal(r.evidence.external_page_verified,true);
 assert.equal(r.public_offer_release_verified,false);
 assert.equal(r.provider_checkout_verified,false);
 assert.equal(r.settled_customer_payment_verified,false);
 assert.equal(r.no_outreach_authority,true);
});
test('operator status text is readable and makes no checkout claim',()=>{
 const status=renderFirstOfferIngressTriage(check(external(),null));
 assert.match(status,/independent|Independent/);
 assert.match(status,/Not verified/);
 assert.match(status,/No router, DNS or firewall changes/);
});
