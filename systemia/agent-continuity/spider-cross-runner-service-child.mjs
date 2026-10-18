#!/usr/bin/env node
// Dedicated child process. Own loopback test service only. No production keys.
import {startSpiderCrossRunnerSandboxService} from './spider-cross-runner-service.mjs';
const root=process.env.SPIDER_DRILL_RUNNER_STATE_ROOT,token=process.env.SPIDER_DRILL_RUNNER_TOKEN;
if(!root||!token||typeof process.send!=='function')throw Error('SPIDER_RUNNER_CHILD_HELD: launcher IPC required');
const api=await startSpiderCrossRunnerSandboxService({root,token});
process.send({type:'READY',url:api.url,pid:process.pid});
let closed=false;
const stop=async()=>{if(closed)return;closed=true;await api.close();process.exit(0)};
process.on('SIGTERM',()=>{stop().catch(()=>process.exit(2))});
process.on('SIGINT',()=>{stop().catch(()=>process.exit(2))});
