import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  createShadowLeaseJournal,recordShadowLease,recordShadowSubmissionIntent,
  releaseShadowLease,
} from '../systemia/yard/shadow-broker-lease-journal.mjs';
import {evaluatePhysicalEvidenceFromJournal as bind}
  from '../systemia/yard/physical-shadow-broker-evidence-binding.mjs';

const NODE='synthetic-acceptance-node';
const LEASE='lease_bounded_evidence_1234';
const TOKEN='e'.repeat(48);
function snapshots(){
  const units={
    nodeseed:{active:'active',enabled:'enabled'},
    broker:{active:'inactive',enabled:'disabled'},
    saban:{active:'active',enabled:'enabled'},
  };
  const make=(n,ports,broker=null)=>({
    node_id:NODE,device_fingerprint:'sha256:'+'a'.repeat(64),
    node_port:42420,resident_services:n,owner_tcp_ports:ports,
    dns:{
      service:'evercraft-edge-dns',
      workload_class:'systemia.evercraft-edge-dns.v1',
      instance_id:'edge_dns_0123456789abcdef',
      dns_tcp_port:1053,health_http_port:44677,
      authoritative:true,recursive:false,dns_tcp:true,dns_udp:true,
    },
    dns_probe:{aa:true,ra:false,rcode:0,answers:1},
    protected_units:structuredClone(units),
    legacy_authority_imported:false,public_route_created:false,
    broker,
  });
  return {
    before:make(1,[1053,42420,44677]),
    during:make(2,[1053,42420,44677,50505],{
      service:'remote-capacity-broker',
      instance_id:'remote_broker_0123456789abcdef12345678',
      endpoint:'http://127.0.0.1:50505',
      authorized_devices:0,registered_nodes:0,
      pending_enrollment_requests:0,
      deployment_receipt_bound:false,public_route_created:false,
    }),
    after:make(1,[42420,44677,1053]),
  };
}
function receipt(){
  const body={
    schema:'evercraft.compute.receipt.v1',
    node_id:NODE,seq:3,
    type:'capacity.lease.released',
    at:'2026-11-19T00:00:00.000Z',
    previous_hash:'f'.repeat(64),
    lease_id:LEASE,
    workload_class:'systemia.remote-capacity-broker.v1',
  };
  return {
    ok:true,
    json:async()=>({
      ok:true,
      receipt:{
        ...body,
        receipt_hash:createHash('sha256')
          .update(JSON.stringify(body)).digest('hex'),
      },
    }),
  };
}
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-bound-acceptance-'));
  fs.chmodSync(root,0o700);
  const journalDir=createShadowLeaseJournal({
    parent:root,expectedNodeId:NODE,
    origin:'http://127.0.0.1:43217',
  });
  recordShadowLease({dir:journalDir,lease:{
    lease_id:LEASE,token:TOKEN,
    expires_at:new Date(Date.now()+60_000).toISOString(),
  }});
  recordShadowSubmissionIntent({dir:journalDir});
  return {root,journalDir};
}
test('real persisted token-free release proof can satisfy a synthetic full three-phase report',async()=>{
  const {root,journalDir}=fixture();
  try{
    const released=await releaseShadowLease({
      dir:journalDir,request:async()=>receipt(),
    });
    assert.equal(released.ok,true);
    const result=bind({...snapshots(),journalDir});
    assert.equal(result.accepted,true,JSON.stringify(result));
    assert.equal(result.journal_release_proof_verified,true);
    assert.equal(result.existing_private_journal_read,true);
    assert.equal(result.actual_live_observation_proven_by_this_adapter,false);
    assert.equal(result.receipt_integrity_only_not_signed,true);
    assert.equal(result.broker_activation_authorized,false);
    assert.equal(result.automatic_retry_allowed,false);
    assert.equal(JSON.stringify(result).includes(TOKEN),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('unconfirmed release is manual hold even with otherwise valid three-phase observations',async()=>{
  const {root,journalDir}=fixture();
  try{
    await releaseShadowLease({dir:journalDir,request:async()=>{
      throw Error('simulated_release_ack_lost');
    }});
    const result=bind({...snapshots(),journalDir});
    assert.equal(result.accepted,false);
    assert.ok(result.hold_reasons.includes(
      'broker_lease_release_not_independently_verified'));
    assert.equal(result.manual_reconciliation_required,true);
    assert.equal(result.automatic_retry_allowed,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('absent or symlink journal is HOLD without private data leakage',()=>{
  const v=snapshots();
  for(const journalDir of [null,'/tmp/evercraft-absent-proof-unlikely-999999']){
    const result=bind({...v,journalDir});
    assert.equal(result.accepted,false);
    assert.equal(result.existing_private_journal_read,false);
    assert.equal(result.broker_activation_authorized,false);
  }
  const {root,journalDir}=fixture();
  try{
    const result=bind({...v,journalDir});
    assert.equal(result.accepted,false);
    assert.equal(result.existing_private_journal_read,true);
    assert.equal(result.journal_release_proof_verified,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
