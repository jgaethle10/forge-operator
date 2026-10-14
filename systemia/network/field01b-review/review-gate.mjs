#!/usr/bin/env node
// Public metadata consistency only: never an authority verifier or deployment action.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const assert=(v,m)=>{if(!v)throw Error('REVIEW_GATE_HELD: '+m)};
const sha=(v)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
export function reviewCandidate(r){
 assert(r&&typeof r==='object'&&!Array.isArray(r),'invalid record');
 assert(r.schema==='evercraft.network.field01b.public-review.v1','schema');
 assert(r.service_id==='evercraft-network-field01b-owned-core','service');
 assert(r.state==='REVIEW_HELD','review state');
 assert(r.repository_visibility==='public_metadata_only'&&r.source_in_public_repo===false,'private Core cannot be published');
 assert(r.contains_secrets===false,'secret or credential material forbidden');
 assert(r.candidate==='field01b-v3-owned-core-p03-20261013','candidate identity');
 assert(sha(r.artifact?.sha256)&&Number.isSafeInteger(r.artifact.bytes)&&r.artifact.bytes>0,'archive identity');
 assert(r.artifact.custody_note==='verified_by_owned_drive_readback_not_by_this_gate','custody boundary');
 for(const name of ['owned_core','yard_ci','yard_fixture']){
   const t=r.tests?.[name];
   assert(t&&Number.isSafeInteger(t.total)&&t.total>0&&t.passed===t.total,'test failure: '+name);
 }
 const f=r.tests.yard_fixture;
 assert(f.release_denial==='compute_attestation_required'&&f.deployed===false&&f.deployment_authorized===false,'fixture must refuse deployment');
 for(const field of ['systemia_admission_receipt','compute_attestation_receipt','yard_deployment_receipt','route_verification_receipt','rollback_receipt','physical_field_test_receipt']){
   assert(Object.hasOwn(r.authority||{},field)&&r.authority[field]===null,'unverified authority: '+field);
 }
 for(const field of ['deployed','compute_executed','physical_exchange_proven','geographic_coverage_proven','carrier_service_proven','emergency_backhaul_proven','public_safety_authority','wsf_deployed']){
   assert(Object.hasOwn(r.claims||{},field)&&r.claims[field]===false,'unsupported claim: '+field);
 }
 assert(r.field01b_reachability?.any_valid_http_response_means_core_reachable===true,'any HTTP response proves core reachable');
 assert(r.field01b_reachability?.unreachable_requires_transport_failure===true,'transport-failure gate');
 assert(r.field01b_reachability?.infrastructure_lan_available_required===true,'LAN remains available');
 return {schema:'evercraft.network.field01b.review-gate-result.v1',candidate:r.candidate,
   review_metadata_consistent:true,admitted_by_systemia:false,deployment_verified:false,
   physical_proof_verified:false,status:'REVIEW_HELD',
   next_gate:'independent_Systemia_admission_and_attested_Compute_authority'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert(process.argv[2],'usage: node review-gate.mjs <review-record.json>');
 console.log(JSON.stringify(reviewCandidate(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
