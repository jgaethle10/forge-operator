#!/usr/bin/env node
// One-command operator ON-DEVICE read-only proof + isolated candidate identity.
// CAUTION: creates/reuses a persistent candidate signing key under --root.
// Does NOT connect to the deployed production agent or enroll Systemia.
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {captureLocalNodeSeedIdentity} from './field-node-readback.mjs';

const get=(name)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null};
const nodeId=get('--node-id'),rawRoot=get('--root');
if(!nodeId||!rawRoot||!isAbsolute(rawRoot))
 throw Error('FIELD_SELF_CHECK_HELD: require --node-id EXACT_NODE_ID --root /absolute/private/candidate-directory');
if(!/^[a-z0-9][a-z0-9._-]{2,95}$/.test(nodeId))
 throw Error('FIELD_SELF_CHECK_HELD: invalid node ID');
const root=resolve(rawRoot);
mkdirSync(root,{recursive:true,mode:0o700});
const identityAlreadyPresent=existsSync(root+'/.identity/identity.json');
const secret=randomBytes(32).toString('hex');
let seed;
try{
 seed=await startNodeSeed({root,nodeId,host:'127.0.0.1',port:0,
  allocatorToken:secret,placementLabels:['blackbox-field-candidate'],
  failureDomain:'UNVERIFIED_OPERATOR_DEVICE',announce:false});
 const evidence=await captureLocalNodeSeedIdentity({endpoint:seed.endpoint,
  expectedNodeId:nodeId,token:secret});
 process.stdout.write(JSON.stringify({
  schema:'evercraft.blackbox.operator-node-field-selfcheck.v1',
  node_id:nodeId,
  identity_preexisting_in_operator_selected_root:identityAlreadyPresent,
  candidate_identity_persisted_locally:true,
  test_server_only_loopback:true,
  test_server_stopped_after_probe:true,
  key_was_owner_provisioned_outside_this_script:false,
  operator_hardware_identity_independently_verified:false,
  canonical_systemia_enrollment_record_created:false,
  live_node002_or_chromebook_agent_modified:false,
  no_spider_or_chum_service_invoked:true,
  execution_authority:'NONE_READ_ONLY',
  public_evidence:evidence
 },null,2)+'\n');
}finally{if(seed)await seed.close()}
