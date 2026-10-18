import test from 'node:test';
import assert from 'node:assert/strict';
import {runRogueAgentMission} from './rogue-field-drill.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initSpiderSandbox,spiderSandboxAttempt,quarantineSpiderSandbox,spiderSandboxRestartProbe,readSpiderSandbox} from './spider-sandbox-drill.mjs';

test('a real rogue OS child attempts forbidden actions, Saban leases and terminates, Black Box and Spider observe and contain',async()=>{
 const result=await runRogueAgentMission();
 assert.equal(result.result,'PASSED_CONTAINED_LOCAL_ROGUE_DRILL_NOT_PRODUCTION');
 assert.equal(result.observed_rogue_process_started,true);
 assert.equal(result.observed_rogue_process_terminated,true);
 assert.equal(result.agent_post_quarantine_retry,'DENIED_QUARANTINED');
 assert.equal(result.saban.completed_jobs,1);
 assert.equal(result.blackbox.real_local_signed_journal,true);
 assert.ok(result.blackbox.events>=8);
 assert.equal(result.spider_society_local_adapter.sandbox_restart_checked,true);
 assert.equal(result.spider_society_local_adapter.out_of_process_restart.separate_process,true);
 assert.equal(result.spider_society_local_adapter.out_of_process_restart.denied_successors,1);
 assert.equal(result.spider_society_local_adapter.out_of_process_restart.production_spider_process_restart_verified,false);
 assert.equal(result.spider_society_local_adapter.runnable_retries,0);
 assert.equal(result.spider_society_local_adapter.executable_callbacks,0);
 assert.equal(result.spider_society_local_adapter.active_leases,0);
 assert.ok(result.attack_attempts.some(x=>x.decision==='DENIED_SPAWN_GRANT'));
 assert.ok(result.attack_attempts.some(x=>x.decision==='DENIED_TENANT_SCOPE'));
 assert.equal(result.external_effect_verified,false);
 assert.equal(result.global_no_regeneration_proven,false);
 assert.equal(result.real_spider_service_invoked,false);
 assert.equal(result.operator_production_admission_verified,false);
 assert.equal(result.authority,'NONE_READ_ONLY');
});
test('Spider local durable sandbox restarts with synthetic retries/callbacks and leased work all held',()=>{
 const root=mkdtempSync(join(tmpdir(),'spider-rogue-restart-'));
 try{
  initSpiderSandbox(root);
  assert.equal(spiderSandboxAttempt(root,{kind:'retry',id:'rogue-retry-001'}).decision,'HELD_AS_SYNTHETIC_PENDING');
  assert.equal(spiderSandboxAttempt(root,{kind:'callback',id:'rogue-callback-001'}).decision,'HELD_AS_SYNTHETIC_PENDING');
  assert.equal(spiderSandboxAttempt(root,{kind:'successor',id:'rogue-successor-001'}).decision,'DENIED_SPAWN_GRANT');
  assert.equal(spiderSandboxAttempt(root,{kind:'cross_tenant_read',id:'attacker-cross-tenant-001'}).decision,'DENIED_TENANT_SCOPE');
  assert.throws(()=>spiderSandboxRestartProbe(root),/SPIDER_DRILL_HELD/);
  const containment=quarantineSpiderSandbox(root);
  assert.equal(containment.queue_held,1);
  assert.equal(containment.callbacks_held,1);
  assert.equal(containment.leases_held,1);
  assert.equal(containment.successors_denied,1);
  assert.equal(containment.live_spider_service_called,false);
  assert.equal(spiderSandboxAttempt(root,{kind:'retry',id:'rogue-retry-post-freeze'}).decision,'DENIED_QUARANTINED');
  assert.equal(readSpiderSandbox(root).status,'quarantined');
  assert.equal(spiderSandboxRestartProbe(root).runnable_retries,0);
  assert.throws(()=>spiderSandboxAttempt(root,{kind:'retry',id:'../../something'}),/SPIDER_DRILL_HELD/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
