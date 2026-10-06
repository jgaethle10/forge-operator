import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildSpreadThresholdRobustness} from "./edge-spread-threshold-robustness.mjs";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-threshold-robustness-"));

const windows=[
  {
    file:"a.json",
    generated_at:"2026-10-06T16:00:00.000Z",
    results:[
      {symbol:"A",entry_spread_bps:1,always_cross_pnl_usd:0.01},
      {symbol:"B",entry_spread_bps:3.5,always_cross_pnl_usd:-0.02},
    ],
  },
  {
    file:"b.json",
    generated_at:"2026-10-06T16:01:00.000Z",
    results:[
      {symbol:"A",entry_spread_bps:2.5,always_cross_pnl_usd:-0.005},
      {symbol:"B",entry_spread_bps:4.5,always_cross_pnl_usd:-0.01},
    ],
  },
];
for(const w of windows){
  fs.writeFileSync(path.join(dir,w.file),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at:w.generated_at,
    simulation_only:true,
    results:w.results,
    live_trade_authority:false,
  }));
}

const report=buildSpreadThresholdRobustness({
  receiptDir:dir,
  thresholds:[2,3,4,5],
});
assert.equal(report.windows,2);
assert.equal(report.instrument_decisions,4);
assert.ok(Math.abs(report.always_cross_total_pnl_usd-(-0.025))<1e-12);
const t2=report.threshold_grid.find(x=>x.max_entry_spread_bps===2);
const t3=report.threshold_grid.find(x=>x.max_entry_spread_bps===3);
const t4=report.threshold_grid.find(x=>x.max_entry_spread_bps===4);
const t5=report.threshold_grid.find(x=>x.max_entry_spread_bps===5);
assert.equal(t2.traded_decisions,1);
assert.equal(t3.traded_decisions,2);
assert.equal(t4.traded_decisions,3);
assert.equal(t5.traded_decisions,4);
assert.ok(t2.improvement_vs_always_cross_usd>0);
assert.ok(t3.improvement_vs_always_cross_usd>0);
assert.ok(t4.improvement_vs_always_cross_usd>0);
assert.ok(Math.abs(t5.improvement_vs_always_cross_usd)<1e-12);
assert.equal(
  report.adjacent_2_3_4_bps_all_nonnegative_vs_always_cross,
  true
);
assert.equal(report.controls.do_not_choose_best_threshold_from_this_grid,true);
assert.equal(report.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  post_hoc_grid_cannot_reauthorize_live_rule:true,
  adjacent_threshold_robustness_checked:true,
  no_live_authority:true
}));
