import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProductionDelegation} from '../dns/production-delegation-gate.mjs';

const node=(id,domain)=>({
  node_id:id,
  endpoint:'https://'+id+'.invalid',
  failure_domain:domain,
  placement_labels:['public-ingress'],
  authorized:true,
  connected:true,
  attestation:{verified:true},
  zero_cost:true,
  public_ingress:true,
  udp53:true,
  tcp53:true,
  supported_workloads:['systemia.evercraft-edge-dns.v1']
});
const tcp=()=>({
  verified:true,
  transport:'tcp53',
  parsed:{aa:true,ra:false,noerror:true,has_expected_txt:true}
});
const domain=()=>({
  delegation_control:{state:'verified'},
  mutation_challenge:{state:'verified'},
  edge_eligible:true
});

test('production delegation requires two distinct admitted nodes plus direct TCP proofs and fresh domain control',()=>{
  const r=evaluateProductionDelegation({
    nodes:[node('a','x'),node('b','y')],
    tcpAuthorityProofs:{a:tcp(),b:tcp()},
    domainControl:domain()
  });
  assert.equal(r.ready,true);
  assert.deepEqual(r.blockers,[]);
});

test('one node can never unlock production delegation',()=>{
  const r=evaluateProductionDelegation({
    nodes:[node('a','x')],
    tcpAuthorityProofs:{a:tcp()},
    domainControl:domain()
  });
  assert.equal(r.ready,false);
  assert.ok(r.blockers.includes('two_distinct_live_attested_zero_cost_public_dns_nodes_required'));
});

test('composed TCP evidence is not accepted as direct TCP authority proof',()=>{
  const weak={verified:true,transport:'composed',parsed:{aa:true,ra:false,noerror:true,has_expected_txt:true}};
  const r=evaluateProductionDelegation({
    nodes:[node('a','x'),node('b','y')],
    tcpAuthorityProofs:{a:tcp(),b:weak},
    domainControl:domain()
  });
  assert.equal(r.ready,false);
  assert.ok(r.blockers.includes('direct_tcp53_authority_proof_missing:b'));
});

test('domain ownership without fresh delegation mutation proof remains blocked',()=>{
  const d=domain();
  d.mutation_challenge={state:'unverified'};
  d.edge_eligible=false;
  const r=evaluateProductionDelegation({
    nodes:[node('a','x'),node('b','y')],
    tcpAuthorityProofs:{a:tcp(),b:tcp()},
    domainControl:d
  });
  assert.equal(r.ready,false);
  assert.ok(r.blockers.includes('fresh_dns_mutation_challenge_unverified'));
  assert.ok(r.blockers.includes('domain_not_edge_eligible'));
});
