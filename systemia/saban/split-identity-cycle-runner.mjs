#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {AmbientWorkQueue} from './ambient-work-queue.mjs';
import {dispatchAmbientJobsOnce} from './ambient-job-dispatcher.mjs';
import {importSplitIdentityCapacity} from './split-identity-capacity.mjs';
import {
  importSplitIdentityOutcomes,
  publishSplitIdentityRequests,
} from './split-identity-handoff.mjs';

// Saban-owned cycle. It never reads the Yard private directory or holds broker
// authority. On --dispatch-content-hash-only it uses the *existing* ambient
// planner but excludes other workloads and the normal ambient-device gateway.
// The current independent Saban dispatcher must be inactive before deployment.
const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
function bounded(value){return Math.min(4,Math.max(1,Math.floor(Number(value)||4)));}
function requireOk(ok,reason){if(!ok)throw new Error('saban_split_'+reason);}
export async function runSabanSplitIdentityCycle({
  sabanRoot,mailboxRoot,maxJobs=4,dispatchQueued=false,
  now=new Date(),dispatchCycle=dispatchAmbientJobsOnce,
}={}){
  requireOk(sabanRoot&&mailboxRoot,'state_and_mailbox_required');
  const root=path.resolve(sabanRoot),stat=fs.lstatSync(root);
  requireOk(stat.isDirectory()&&!stat.isSymbolicLink(),'private_state_invalid');
  const cap=bounded(maxJobs);

  // Import verified results before considering fresh work. A stale/absent
  // broker inventory must not prevent importing evidence for older jobs.
  const imported=importSplitIdentityOutcomes({
    sabanRoot:root,mailboxRoot,maxOutcomes:cap,
  });

  let capacity=null,dispatched=null,published=null,reason=null;
  if(dispatchQueued===true){
    try{
      capacity=importSplitIdentityCapacity({
        mailboxRoot,sabanRoot:root,now,maxAgeMs:90_000,
      });
    }catch(error){
      // Never plan/dispatch with stale capacity or inherited cached offers.
      reason='verified_fresh_capacity_unavailable';
    }
    if(capacity){
      dispatched=await dispatchCycle({
        root,maxJobs:cap,nodeSeedOnly:true,now,
      });
      published=publishSplitIdentityRequests({
        sabanRoot:root,mailboxRoot,maxRequests:cap,
      });
    }
  }

  // Queue is still owned and modified only by the Saban account.
  const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});
  return {
    schema:'evercraft.saban.split-identity-cycle.v1',
    autonomous_planning_enabled:dispatchQueued===true,
    content_hash_only:dispatchQueued===true,
    fresh_capacity_accepted:capacity!==null,
    safe_capacity_receipt_hash:capacity?.inventory_receipt_hash||null,
    imported_verified_results:imported.applied,
    published_requests:published?.published||0,
    considered_jobs:dispatched?.considered_jobs||0,
    created_handoffs:dispatched?.handoff_wait||0,
    held_jobs:queue.list({states:['held']}).length,
    status:reason?'held':(dispatchQueued?'active':'import_only'),
    hold_reason:reason,
    authority_material_persisted:false,
    yard_private_state_read:false,
    commercial_capacity_authorized:false,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}
async function main(){
  const result=await runSabanSplitIdentityCycle({
    sabanRoot:arg('--saban-root',process.env.SABAN_AMBIENT_STATE_DIR||''),
    mailboxRoot:arg('--mailbox-root',''),
    maxJobs:Number(arg('--max-jobs','4')),
    dispatchQueued:process.argv.includes('--dispatch-content-hash-only'),
  });
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,schema:'evercraft.saban.split-identity-cycle-error.v1',
      error:String(error?.message||'cycle_failed').slice(0,120),
      authority_material_persisted:false,
    })+'\n');
    process.exitCode=1;
  });
}
