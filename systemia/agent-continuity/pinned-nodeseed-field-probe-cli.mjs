#!/usr/bin/env node
// READ-ONLY operator field preflight. Must be given two owner-managed node
// identities and their pinned fingerprints via protected runtime configuration.
// No test harness identities are accepted as field identities. No dispatch.
import {probePinnedNodePair} from './pinned-nodeseed-pair.mjs';
const e=process.env;
const configured=String(e.BLACKBOX_FIELD_PINNED_NODES_JSON||'');
if(!configured){
 process.stdout.write(JSON.stringify({
  schema:'evercraft.blackbox.field-node-pair-preflight.v1',
  state:'HELD_INDEPENDENT_OWNER_NODE_PINS_UNAVAILABLE',
  device_query_performed:false,actual_owner_enrollment_verified:false,
  systemia_admission_verified:false,spider_runtime_proven:false,
  production_release_authorized:false,execution_authority:'NONE_READ_ONLY'
 },null,2)+'\n');
 process.exit(0);
}
if(configured.length>4096)throw Error('NODESEED_FIELD_GATE_HELD: pin config too large');
const nodes=JSON.parse(configured);
if(!Array.isArray(nodes)||nodes.length!==2||
 nodes.some(n=>!String(n.endpoint||'').startsWith('https://')))
 throw Error('NODESEED_FIELD_GATE_HELD: field requires two HTTPS NodeSeed endpoints');
if(String(e.BLACKBOX_FIELD_OWNER_REGISTRY_APPROVED||'')!=='true')
 throw Error('NODESEED_FIELD_GATE_HELD: independent owner registry approval missing');
// Do not treat this environment flag as a cryptographic proof of the registry.
// It is a manual admission precondition; the field result still stays held.
const tokens=String(e.BLACKBOX_FIELD_NODE_TOKENS_JSON||'');
if(tokens.length>4096)throw Error('NODESEED_FIELD_GATE_HELD: secret config too large');
const tokenByNode=tokens?JSON.parse(tokens):{};
const actual=await probePinnedNodePair({nodes,tokenByNode});
process.stdout.write(JSON.stringify({
 ...actual,
 field_preflight_state:'CHALLENGE_RESPONSE_VALID_KEYS_PINNED_BUT_HARDWARE_AND_SYSTEMIA_PENDING',
 separate_hardware_custody_verified:false,
 production_run_authorized:false
},null,2)+'\n');
