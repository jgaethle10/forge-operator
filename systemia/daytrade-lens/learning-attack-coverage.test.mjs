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
      },
      {
        test:"aggressive-versus-passive execution comparison",
        lesson_ids:["order-flow-information"],
        roles:["execution_cost_guard"],
        support_count:1,
        priority:"P0"
      }
    ]
  }
};

const result=reconcileLearningAttackCoverage(receipt);
assert.equal(result.attack_count,4);
assert.equal(result.counts.implemented,2);
assert.equal(result.counts.partial,2);
assert.equal(result.counts.missing,0);
assert.equal(result.frontier[0].test,"aggressive-versus-passive execution comparison");
assert.equal(result.next_frontier.implementation_status,"partial");
assert.equal(
  ATTACK_IMPLEMENTATION_MAP["aggressive-versus-passive execution comparison"].status,
  "partial"
);
assert.match(
  ATTACK_IMPLEMENTATION_MAP["aggressive-versus-passive execution comparison"].gap,
  /never labeled a fill/
);
assert.equal(
  ATTACK_IMPLEMENTATION_MAP["capital-scale invariance challenge"].status,
  "partial"
);
assert.match(
  ATTACK_IMPLEMENTATION_MAP["capital-scale invariance challenge"].gap,
  /market impact/
);

assert.equal(
  ATTACK_IMPLEMENTATION_MAP["volume-is-not-liquidity negative control"].status,
  "implemented"
);
assert.equal(
  ATTACK_IMPLEMENTATION_MAP["low-depth high-volatility stress"].status,
  "partial"
);
assert.match(
  ATTACK_IMPLEMENTATION_MAP["low-depth high-volatility stress"].gap,
  /not full market depth/
);

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
  closed_cscv_gap_removed_from_frontier:true,
  partial_execution_frontier_exposed:true,
  passive_touch_never_promoted_to_fill:true,
  volume_not_liquidity_closed:true,
  low_visible_size_high_volatility_partial:true,
  capital_scale_visibility_partial_not_impact_model:true,
  explicit_evidence_mapping:true,
  frozen_protocol_mutation_forbidden:true,
  live_trade_authority:false
}));
