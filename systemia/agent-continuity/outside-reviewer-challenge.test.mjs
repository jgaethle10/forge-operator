import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runOutsideReviewerChallenge} from './outside-reviewer-challenge.mjs';

test('external reviewer one-shot challenge invokes real local Saban, Spider and NodeSeed processes without claiming live integration',async()=>{
 const x=await runOutsideReviewerChallenge();
 assert.equal(x.status,'PASS_REVIEWER_LOCAL_SAFETY_DRILL_ONLY');
 assert.equal(x.real_os_rogue_process_started_and_terminated,true);
 assert.equal(x.blackbox_signed_local_event_count,8);
 assert.equal(x.local_spider_replay_denied_before_restart,4);
 assert.equal(x.local_spider_replay_denied_after_restart,4);
 assert.equal(x.local_spider_no_pending_work_on_restart,true);
 assert.equal(x.pinned_lab_nodeseed_processes,2);
 assert.equal(x.fresh_ed25519_challenges,2);
 assert.equal(x.verified_production_effects,0);
 assert.equal(x.live_entire_integration_verified,false);
 assert.equal(x.live_spider_service_verified,false);
 assert.equal(x.canonical_systemia_admitted,false);
 assert.equal(x.permission_to_run_remote_actions,false);
 assert.equal(x.ready_for_founder_release_review,true);
 assert.ok(/^([a-f0-9]{64})$/.test(x.reviewer_receipt_sha256));
 assert.equal(x.rogue_attempts.length,5);
 assert.ok(x.rogue_attempts.every(r=>r.executed===false));
});
test('command line reviewer execution is opt-in, no external URLs or credentials accepted as arguments',()=>{
 const file=fileURLToPath(new URL('./outside-reviewer-challenge.mjs',import.meta.url));
 const r=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:25000,maxBuffer:32768,
  env:{PATH:process.env.PATH||'',HOME:process.env.HOME||'',TMPDIR:process.env.TMPDIR||'/tmp'}});
 assert.equal(r.status,0,String(r.stderr||r.error).slice(0,900));
 const out=JSON.parse(r.stdout);
 assert.equal(out.status,'PASS_REVIEWER_LOCAL_SAFETY_DRILL_ONLY');
 assert.equal(JSON.stringify(out).includes('PRIVATE KEY'),false);
 assert.equal(JSON.stringify(out).includes('Bearer '),false);
 assert.equal(JSON.stringify(out).includes('http://'),false);
 assert.equal(JSON.stringify(out).includes('https://'),false);
 assert.equal(out.two_physical_node_independence_verified,false);
});
