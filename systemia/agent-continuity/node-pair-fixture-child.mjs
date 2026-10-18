#!/usr/bin/env node
// Dedicated CI-only REAL Evercraft NodeSeed HTTP process. Synthetic registration
// over parent IPC is NOT independently enrolled owner device identity.
import {startNodeSeed} from '../compute/node-seed.mjs';
const root=process.env.BLACKBOX_NODES_LAB_ROOT;
const nodeId=process.env.BLACKBOX_NODES_LAB_ID;
const allocatorToken=process.env.BLACKBOX_NODES_LAB_TOKEN;
if(process.env.BLACKBOX_NODES_LAB_ONLY!=='1'||!root||!nodeId||!allocatorToken||
 typeof process.send!=='function')throw Error('NODESEED_PAIR_FIXTURE_HELD: runner-only fixture');
const seed=await startNodeSeed({root,nodeId,host:'127.0.0.1',port:0,
 allocatorToken,announce:false,placementLabels:['synthetic','blackbox-lab'],
 failureDomain:'CI_SINGLE_HOST_NOT_PHYSICALLY_INDEPENDENT'});
process.send({type:'NODE_READY',node_id:nodeId,endpoint:seed.endpoint,
 fingerprint:seed.device_fingerprint,
 enrollment:'CI_EPHEMERAL_SELF_SIGNED_NOT_OWNER_ENROLLED'});
let closing=false;
const close=async()=>{
 if(closing)return;closing=true;
 await seed.close();process.exit(0);
};
process.on('SIGTERM',()=>close().catch(()=>process.exit(3)));
process.on('SIGINT',()=>close().catch(()=>process.exit(3)));
