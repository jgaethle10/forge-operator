import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildInstrumentConditionedSpread} from "./edge-instrument-conditioned-spread.mjs";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-conditioned-spread-"));
const rows=[
  {file:"a.json",generated_at:"2026-10-06T16:00:00.000Z",results:[
    {symbol:"SOXX",entry_spread_bps:2,always_cross_pnl_usd:0.01},
    {symbol:"SMH",entry_spread_bps:4,always_cross_pnl_usd:-0.02}
  ]},
  {file:"b.json",generated_at:"2026-10-06T16:06:00.000Z",results:[
    {symbol:"SOXX",entry_spread_bps:5,always_cross_pnl_usd:-0.03},
    {symbol:"SMH",entry_spread_bps:2,always_cross_pnl_usd:0.005}
  ]},
  {file:"c.json",generated_at:"2026-10-06T16:12:00.000Z",results:[
    {symbol:"SOXX",entry_spread_bps:4,always_cross_pnl_usd:-0.01},
    {symbol:"SMH",entry_spread_bps:1,always_cross_pnl_usd:0.004}
  ]}
];
for(const row of rows){
  fs.writeFileSync(path.join(dir,row.file),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at:row.generated_at,
    results:row.results,
    live_trade_authority:false
  }));
}
const report=buildInstrumentConditionedSpread({receiptDir:dir,thresholdBps:3});
assert.equal(report.raw_windows,3);
assert.equal(report.windows,3);
assert.equal(report.near_duplicate_windows_excluded,0);
assert.equal(report.decisions,6);
assert.equal(report.by_symbol.SOXX.tight.count,1);
assert.equal(report.by_symbol.SOXX.wide.count,2);
assert.equal(report.by_symbol.SMH.tight.count,2);
assert.equal(report.by_symbol.SMH.wide.count,1);
assert.ok(report.by_symbol.SOXX.wide.mean_always_cross_pnl_usd<0);
assert.ok(report.by_symbol.SMH.tight.mean_always_cross_pnl_usd>0);
assert.equal(report.controls.analysis_uses_independent_windows,true);
assert.equal(report.controls.no_causal_claim,true);
assert.equal(report.live_trade_authority,false);
console.log(JSON.stringify({
  ok:true,
  instrument_conditioning_present:true,
  no_causal_claim:true,
  live_trade_authority:false
}));
