import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildPracticePhaseScorecard} from "./edge-practice-phase-scorecard.mjs";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-phase-score-"));
const rows=[
  ["a.json","2026-10-06T13:45:00.000Z",0.01,-0.01,0.02,1,2],
  ["b.json","2026-10-06T16:00:00.000Z",-0.01,-0.02,0.01,1,2],
  ["c.json","2026-10-06T19:30:00.000Z",0.00,-0.03,0.03,2,1],
];
for(const [file,generated_at,gov,always,improve,abstain,trades] of rows){
  fs.writeFileSync(path.join(dir,file),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at,
    aggregate:{
      governed_total_pnl_usd:gov,
      always_cross_total_pnl_usd:always,
      rule_improvement_vs_always_cross_usd:improve,
      abstained_count:abstain,
      traded_count:trades
    },
    live_trade_authority:false
  }));
}
const score=buildPracticePhaseScorecard({receiptDir:dir});
assert.equal(score.by_phase.OPENING.windows,1);
assert.equal(score.by_phase.MIDDAY.windows,1);
assert.equal(score.by_phase.CLOSING.windows,1);
assert.equal(score.by_phase.CLOSING.total_abstentions,2);
assert.equal(score.controls.phases_not_pooled_for_authorization,true);
assert.equal(score.live_trade_authority,false);
console.log(JSON.stringify({
  ok:true,
  opening_midday_closing_separated:true,
  phases_not_pooled_for_authorization:true,
  live_trade_authority:false
}));
