import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promoteDomainControl } from '../scripts/promote-ionos-domain-control.mjs';

const challenge=fs.readFileSync(new URL('../scripts/ionos-domain-control-challenge.mjs',import.meta.url),'utf8');

test('IONOS domain-control challenge stays fail-closed and uses independent resolvers',()=>{
  assert.match(challenge,/process\.env\.IONOS_API_KEY/);
  assert.match(challenge,/blocked_missing_ionos_api_key/);
  assert.match(challenge,/1\.1\.1\.1/);
  assert.match(challenge,/8\.8\.8\.8/);
  assert.match(challenge,/evercraft-domain-control=/);
  assert.match(challenge,/secret_material_exposed:false/);
});

test('promotion requires both domain-control and owned-edge proof',()=>{
  const registry={
    schema:'evercraft.edge.domain-control.v1',
    domains:[{domain:'systemiacommandcenters.com',delegation_control:{state:'unverified'},edge_eligible:false}],
  };
  const frontDoors={schema:'evercraft.edge.front-doors.v1',state:'candidate_until_public_root_control_verified',services:[]};
  const receipt={
    schema:'evercraft.ionos-domain-control-challenge.v1',
    domain:'systemiacommandcenters.com',
    verified:true,
    edge_eligible:true,
    challenge_name:'_evercraft-control.systemiacommandcenters.com',
    challenge_value:'evercraft-domain-control=abc123abc123',
    token_unique:true,
    parent_ns:['ns1.example','ns2.example'],
    external_verifiers:[
      {server:'1.1.1.1',values:['evercraft-domain-control=abc123abc123']},
      {server:'8.8.8.8',values:['evercraft-domain-control=abc123abc123']},
    ],
    observed_at:'2026-10-06T16:12:06.764Z',
  };
  const edgeReceipt={
    schema:'evercraft.operator-public-edge-observation.v1',
    origin:'https://fabric.systemiacommandcenters.com',
    verified:true,
    public_https_verified:true,
    mcp_verified:true,
    source:{workflow_run_id:37493790611},
  };
  const out=promoteDomainControl({receipt,edgeReceipt,registry,frontDoors,evidenceRef:'GitHubActionsRun:test'});
  assert.equal(out.registry.domains[0].delegation_control.state,'verified');
  assert.equal(out.registry.domains[0].mutation_challenge.state,'verified');
  assert.equal(out.registry.domains[0].edge_eligible,true);
  const fabric=out.frontDoors.services.find(x=>x.service_id==='fabric');
  assert.ok(fabric);
  assert.deepEqual(fabric.public_hosts,['fabric.systemiacommandcenters.com']);
  assert.equal(out.frontDoors.state,'public_root_control_verified');
});

test('promotion rejects an unverified edge',()=>{
  assert.throws(()=>promoteDomainControl({
    receipt:{schema:'evercraft.ionos-domain-control-challenge.v1',domain:'systemiacommandcenters.com',verified:true,edge_eligible:true},
    edgeReceipt:{schema:'evercraft.operator-public-edge-observation.v1',origin:'https://fabric.systemiacommandcenters.com',verified:false},
    registry:{domains:[{domain:'systemiacommandcenters.com'}]},
    frontDoors:{services:[]},
    evidenceRef:'x',
  }),/verified_owned_fabric_edge_receipt_required/);
});
