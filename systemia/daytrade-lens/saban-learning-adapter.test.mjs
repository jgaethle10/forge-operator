import assert from "node:assert/strict";
import fs from "node:fs";
import { ROLE_ATTACKS, runAssignment, reconcile, discoverScholarlySources } from "./saban-learning-adapter.mjs";

const sourcePack=JSON.parse(
  fs.readFileSync(
    "systemia/daytrade-lens/learning/market-edge-source-pack-v1.json",
    "utf8"
  )
);
const registry=JSON.parse(
  fs.readFileSync("systemia/saban/multiplication-registry.json","utf8")
);
const learningContract=registry.software.find(
  (row)=>row.software_id==="daytrade-learning-lab"
);
assert.ok(learningContract);
assert.equal(sourcePack.lessons.length,12);
assert.equal(Object.keys(ROLE_ATTACKS).length,11);
assert.equal(
  learningContract.default_logical_agents,
  sourcePack.lessons.length*Object.keys(ROLE_ATTACKS).length
);
assert.equal(learningContract.assignment_strategy,"role_item_cartesian");

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
assert.equal(roles.length,11);

const fakeFetch=async()=>({
  ok:true,
  json:async()=>({
    message:{
      items:[
        {
          DOI:"10.1234/proof",
          title:["Execution Cost and Implementation Shortfall in Trading"],
          publisher:"Proof Press",
          type:"journal-article",
          URL:"https://doi.org/10.1234/proof",
          author:[{family:"Proof"}],
          published:{"date-parts":[[2026,1,1]]}
        },
        {
          DOI:"10.1234/fish",
          title:["Feeding Cost Risk in Aquaculture"],
          publisher:"Fish Press",
          type:"journal-article",
          URL:"https://doi.org/10.1234/fish",
          author:[{family:"Fish"}],
          published:{"date-parts":[[2026,1,2]]}
        }
      ]
    }
  })
});
const discovered=await discoverScholarlySources(lesson,fakeFetch);
assert.equal(discovered.provider,"Crossref");
assert.equal(discovered.candidates.length,1);
assert.equal(discovered.candidates[0].doi,"10.1234/proof");
assert.equal(discovered.raw_candidate_count,2);
assert.equal(discovered.rejected_candidate_count,1);
assert.equal(
  discovered.candidates.some((row)=>row.doi==="10.1234/fish"),
  false
);
assert.equal(discovered.relevance_policy.all_groups_required,true);

const sourceHunter=await runAssignment({
  assignment:{
    agent_id:"agent:source-hunter",
    role:"academic_source_hunter",
    item:{raw:lesson}
  },
  executionContext:{fetchImpl:fakeFetch}
});
assert.equal(sourceHunter.source_discovery.candidates.length,1);
assert.equal(sourceHunter.live_trade_authority,false);

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
      },
      executionContext:{fetchImpl:fakeFetch}
    }));
  }
}

const receipt=reconcile({results});
assert.equal(receipt.status,"reconciled");
assert.equal(receipt.assignments,22);
assert.equal(receipt.role_count,11);
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
  crossref_read_only_discovery:true,
  twelve_lessons_by_eleven_roles_exact_cartesian_pass:true,
  lesson_specific_relevance_gate:true,
  irrelevant_cost_paper_rejected:true,
  role_item_attack:true,
  reconciled_attack_queue:true,
  frozen_protocol_mutation_forbidden:true,
  live_trade_authority:false
}));
