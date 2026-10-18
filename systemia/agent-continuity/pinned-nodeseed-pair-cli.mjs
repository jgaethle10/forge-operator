#!/usr/bin/env node
import {runPinnedNodeSeedPairLab} from './node-pair-live-lab.mjs';
const x=await runPinnedNodeSeedPairLab();
if(x.result!=='PASS_TWO_REAL_NODESEED_PROCESSES_CI_SINGLE_HOST_ONLY'||
 x.distinct_signing_keys_verified!==true||x.production_enrollment_verified!==false||
 x.physically_distinct_hardware_verified!==false||x.authority!=='NONE_READ_ONLY')
 throw Error('NODESEED_PAIR_CI_HELD: acceptance mismatch');
process.stdout.write(JSON.stringify(x,null,2)+'\n');
