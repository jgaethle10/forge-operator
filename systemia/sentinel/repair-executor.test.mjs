import test from'node:test';import assert from'node:assert/strict';import{authorizeRepair,buildExecutionPlan,executionReceipt}from'./repair-executor.mjs';
const good={finding_key:'x',authority:'bounded_autonomous',next:'repair',fingerprint:{key:'f'},selected_strategy:{recipe_id:'rerun',authority:'autonomous',action:{type:'github_rerun_failed_jobs'},verification:['green']}};
test('allowlisted autonomous treatment can execute',()=>assert.equal(authorizeRepair(good).ok,true));
test('source patches cannot cross executor boundary',()=>assert.equal(authorizeRepair({...good,selected_strategy:{...good.selected_strategy,authority:'queue_exact_code_repair',action:{type:'source_patch_recipe'}}}).ok,false));
test('human gate cannot execute',()=>assert.equal(authorizeRepair({...good,authority:'human_gate'}).ok,false));
test('plan carries verification and fingerprint',()=>{const[p]=buildExecutionPlan({items:[good]});assert.equal(p.fingerprint_key,'f');assert.deepEqual(p.verification,['green']);});
test('attempt is never success without verification',()=>assert.equal(executionReceipt({finding_key:'x'},{executed:true,verified:false}).outcome,'failed'));
test('verified execution closes green',()=>assert.equal(executionReceipt({finding_key:'x'},{executed:true,verified:true}).outcome,'verified_green'));
