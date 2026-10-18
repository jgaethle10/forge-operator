#!/usr/bin/env node
// A separate OS process reopens Spider's local durable state with no in-memory
// access to the rogue worker or the controller. Read-only local snapshot proof;
// not a real Spider Society runtime restart nor global no-regeneration.
import {readSpiderSandbox,spiderSandboxRestartProbe} from './spider-sandbox-drill.mjs';
const root=process.argv[2];
if(!root)throw Error('SPIDER_RESTART_PROCESS_HELD: absolute root required');
const state=readSpiderSandbox(root);
const proof=spiderSandboxRestartProbe(root);
if(!proof.sandbox_restart_checked||proof.runnable_retries!==0||
 proof.executable_callbacks!==0||proof.active_leases!==0||
 state.status!=='quarantined')throw Error('SPIDER_RESTART_PROCESS_HELD: unsafe state');
process.stdout.write(JSON.stringify({
 schema:'evercraft.spider.out-of-process-sandbox-restart-proof.v1',
 separate_process:true,source:'FSYNCED_LOCAL_SANDBOX_STATE',
 state_generation:state.generation,
 ...proof,
 pending_successors:state.successors.filter(x=>x.state==='pending').length,
 denied_successors:state.successors.filter(x=>x.state==='denied').length,
 production_spider_process_restart_verified:false,
 actual_global_successor_inventory_verified:false
 })+'\n');
