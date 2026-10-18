#!/usr/bin/env node
// Run ON the target physical device. This only queries that device's existing
// localhost NodeSeed server and prints PUBLIC signed evidence to stdout.
// Never print or embed the allocator token, private key or host endpoint.
import {captureLocalNodeSeedIdentity} from './field-node-readback.mjs';
const arg=(k,defaultValue='')=>{const i=process.argv.indexOf(k);return i>=0?(process.argv[i+1]||''):defaultValue};
const expectedNodeId=arg('--node-id');
const endpoint=arg('--endpoint','http://127.0.0.1:42420');
if(!expectedNodeId)throw Error('Usage: node field-node-readback-cli.mjs --node-id EXACT_LOCAL_NODESEED_ID [--endpoint http://127.0.0.1:42420]. Only existing local servers; no enrollment or daemon launch.');
const evidence=await captureLocalNodeSeedIdentity({expectedNodeId,endpoint,
 token:process.env.BLACKBOX_LOCAL_NODESEED_TOKEN||''});
process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
