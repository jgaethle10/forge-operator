import assert from "node:assert/strict";
import {
  normalizeMultiLevelDepthSnapshot,
  summarizeMultiLevelDepth,
  buildDepthDataContract,
} from "./edge-depth-data-contract.mjs";

const contract=buildDepthDataContract();
assert.equal(contract.provider_connected,false);
assert.equal(contract.current_measurement_state,"unavailable_not_observed");
assert.equal(
  contract.invariants.nbbo_top_of_book_must_not_satisfy_multi_level_depth,
  true
);
assert.equal(contract.invariants.missing_is_never_zero,true);

assert.throws(
  ()=>normalizeMultiLevelDepthSnapshot({
    provider:"proof",
    scope:"l2",
    symbol:"SOXX",
    timestamp:"2026-10-01T14:30:00Z",
    bids:[{price:100,size:10}],
    asks:[{price:100.1,size:10}],
  }),
  /multi_level_required/
);

const snapshot=normalizeMultiLevelDepthSnapshot({
  provider:"proof-depth-provider",
  scope:"multi_level_book",
  symbol:"SOXX",
  timestamp:"2026-10-01T14:30:00Z",
  bids:[
    {price:100.00,size:100},
    {price:99.99,size:200},
    {price:99.98,size:300},
  ],
  asks:[
    {price:100.02,size:50},
    {price:100.03,size:75},
    {price:100.04,size:125},
  ],
});
assert.equal(snapshot.measurement_state,"observed_multi_level_book");
assert.equal(snapshot.bid_level_count,3);
assert.equal(snapshot.ask_level_count,3);
assert.equal(snapshot.full_market_depth_claimed,false);

const summary=summarizeMultiLevelDepth(snapshot,{levels:3});
assert.equal(summary.cumulative_bid_size,600);
assert.equal(summary.cumulative_ask_size,250);
assert.ok(summary.depth_imbalance>0);
assert.equal(summary.top_of_book_substitution_used,false);
assert.equal(summary.full_market_depth_claimed,false);

assert.throws(
  ()=>normalizeMultiLevelDepthSnapshot({
    provider:"proof",
    scope:"l2",
    symbol:"SOXX",
    timestamp:"2026-10-01T14:30:00Z",
    bids:[{price:101,size:10},{price:100.9,size:20}],
    asks:[{price:100,size:10},{price:100.1,size:20}],
  }),
  /crossed_book/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-depth-data-contract-proof.v1",
  provider_neutral_multi_level_schema:true,
  provenance_required:true,
  multi_level_both_sides_required:true,
  top_of_book_cannot_masquerade_as_depth:true,
  depth_imbalance_requires_observed_sizes:true,
  full_market_depth_not_claimed:true,
  missing_never_zero:true,
  live_trade_authority:false
}));
