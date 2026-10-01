import assert from "node:assert/strict";
import { ROLE_ATTACKS, runAssignment, reconcile } from "./saban-learning-adapter.mjs";

const lesson={
  lesson_id:"implementation-shortfall",
  title:"Paper alpha is not executable alpha",
  principle:"Execution belongs inside the edge definition.",
  sources:[{url:"https://example.invalid/source"}],
  attacks:["Score implementation shortfall."]
};

const one=await runAssignment({
  assignment:{
    agent_id:"agent:proof",
    role:"execution_cost_guard",
    item:{raw:lesson}
  }
});
assert.equal(one.status,"completed");
assert.equal(one.live_trade_authority,false);
assert.equal(one.autonomous_order_authority,false);
assert.ok(one.attack.proposed_tests.includes("decision-to-fill implementation shortfall"));

const roles=Object.keys(ROLE_ATTACKS);
assert.equal(roles.length,10);

const results=[];
for(const role of roles){
  for(const lessonId of ["implementation-shortfall","backtest-overfitting"]){
    results.push(await runAssignment({
      assignment:{
        agent_id:role+":"+lessonId,
        role,
        item:{raw:{
          ...lesson,
          lesson_id:lessonId
        }}
      }
    }));
  }
}

const receipt=reconcile({results});
assert.equal(receipt.status,"reconciled");
assert.equal(receipt.assignments,20);
assert.equal(receipt.role_count,10);
assert.equal(receipt.lesson_count,2);
assert.ok(receipt.attack_queue.length>0);
assert.ok(receipt.attack_queue.some((row)=>row.test==="full trial-count ledger"));
assert.ok(receipt.attack_queue.some((row)=>row.test==="decision-to-fill implementation shortfall"));
assert.equal(receipt.eligibility_mutated,false);
assert.equal(receipt.live_trade_authority,false);

await assert.rejects(
  ()=>runAssignment({assignment:{role:"hype_engine",item:{raw:lesson}}}),
  /daytrade_learning_role_unknown/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.saban-learning-adapter-proof.v1",
  roles:roles.length,
  role_item_attack:true,
  reconciled_attack_queue:true,
  frozen_protocol_mutation_forbidden:true,
  live_trade_authority:false
}));
