#!/usr/bin/env node
// Run a single source-bound local Saban assignment through Systemia's
// persistent goal dispatcher. No GitHub writes, deployment or paid effects.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runKaidanceWorldsSabanReview} from './kaidance-worlds-saban-review.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
function arg(name){const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1]||'';}
const out=arg('--out')||process.env.SYSTEMIA_KAIDANCE_SABAN_WORLD_REVIEW_OUT_DIR||
 path.join(repo,'artifacts/kaidance-worlds-saban-review');
runKaidanceWorldsSabanReview({outDir:path.resolve(out)}).then(({report})=>{
 console.log(JSON.stringify({schema:'evercraft.kaidance.saban-world-review-run.v1',
  ok:report.local_readonly_completed,
  state:report.state,goal_key:report.goal_key,
  local_registered_assignment_executed:report.actual_assignment_ran_this_cycle,
  new_readonly_review:report.new_verified_source_review_this_cycle,
  remote_worker_launched:false,production_mutations:0}));
 if(!report.local_readonly_completed)process.exitCode=1;
}).catch(error=>{
 console.error(JSON.stringify({schema:'evercraft.kaidance.saban-world-review-run.v1',
  ok:false,reason:String(error?.message||error).slice(0,160),
  provider_effects_approved:false}));
 process.exitCode=1;
});
