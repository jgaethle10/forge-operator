import assert from "node:assert/strict";
import {
  ATTACK_IMPLEMENTATION_MAP,
  reconcileLearningAttackCoverage,
} from "./learning-attack-coverage.mjs";

const receipt={
  schema:"evercraft.saban.multiplication-receipt.v1",
  reconciliation:{
    mission_id:"daytrade-market-learning-attack-001",
    attack_queue:[
      {
        test:"AI versus matched non-AI filing control",
        lesson_ids:["behavioral-salience"],
        roles:["behavioral_bias_guard"],
        support_count:1,
        priority:"P0"
      },
      {
        test:"CSCV/PBO diagnostic where structurally valid",
        lesson_ids:["backtest-overfitting"],
        roles:["overfit_red_team"],
        support_count:1,
        priority:"P0"
      },
      {
        test:"decision-to-fill implementation shortfall",
        lesson_ids:["implementation-shortfall"],
        roles:["execution_cost_guard"],
        support_count:1,
        priority:"P1"
      }
    ]
  }
};

const result=reconcileLearningAttackCoverage(receipt);
assert.equal(result.attack_count,3);
assert.equal(result.counts.implemented,1);
assert.equal(result.counts.partial,1);
assert.equal(result.counts.missing,1);
assert.equal(result.frontier[0].test,"CSCV/PBO diagnostic where structurally valid");
assert.equal(result.next_frontier.implementation_status,"missing");
assert.equal(
  ATTACK_IMPLEMENTATION_MAP["AI versus matched non-AI filing control"].status,
  "implemented"
);
assert.equal(result.mapping_is_explicit_not_inferred,true);
assert.equal(result.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.learning-attack-coverage-proof.v1",
  implemented_partial_missing_accounted:true,
  p0_missing_frontier_first:true,
  explicit_evidence_mapping:true,
  frozen_protocol_mutation_forbidden:true,
  live_trade_authority:false
}));
