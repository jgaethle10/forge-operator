import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildPracticeDiversityReadiness} from "./edge-practice-diversity-readiness.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-diversity-"));
const receipts=path.join(root,"receipts");
fs.mkdirSync(receipts);
const protocol=path.join(root,"protocol.json");
fs.writeFileSync(protocol,JSON.stringify({
  schema:"evercraft.daytrade.practice-diversity-protocol.v1",
  protocol_id:"test",
  minimum_prospective_windows:6,
  minimum_distinct_market_dates:2,
  required_market_phases:["OPENING","MIDDAY","CLOSING"],
  minimum_windows_per_required_phase:1,
  minimum_independent_window_separation_minutes:5,
  frozen_execution_rule:"spread-abstention-v1",
  live_trade_authority:false,
}));

function write(name,generated_at){
  fs.writeFileSync(path.join(receipts,name),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at,
    simulation_only:true,
    live_trade_authority:false,
  }));
}

write("1.json","2026-10-06T13:45:00.000Z");
write("2.json","2026-10-06T16:00:00.000Z");
write("3.json","2026-10-06T19:30:00.000Z");
write("4.json","2026-10-07T13:50:00.000Z");
write("5.json","2026-10-07T16:10:00.000Z");
write("6.json","2026-10-07T19:35:00.000Z");

const ready=buildPracticeDiversityReadiness({
  receiptDir:receipts,
  protocolPath:protocol,
});
assert.equal(ready.status,"PRACTICE_DIVERSITY_READY");
assert.equal(ready.observed.raw_prospective_windows,6);
assert.equal(ready.observed.independent_prospective_windows,6);
assert.equal(ready.observed.near_duplicate_windows_excluded,0);
assert.equal(ready.observed.distinct_market_dates_et,2);
assert.equal(ready.observed.phase_counts.OPENING,2);
assert.equal(ready.observed.phase_counts.MIDDAY,2);
assert.equal(ready.observed.phase_counts.CLOSING,2);
assert.equal(ready.live_trade_authority,false);

const oneDay=path.join(root,"one-day");
fs.mkdirSync(oneDay);
for(let i=0;i<6;i++){
  fs.writeFileSync(path.join(oneDay,i+".json"),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at:`2026-10-06T16:${String(i).padStart(2,"0")}:00.000Z`,
    simulation_only:true,
    live_trade_authority:false,
  }));
}
const blocked=buildPracticeDiversityReadiness({
  receiptDir:oneDay,
  protocolPath:protocol,
});
assert.equal(blocked.status,"PRACTICE_DIVERSITY_NOT_READY");
assert.equal(blocked.observed.raw_prospective_windows,6);
assert.equal(blocked.observed.independent_prospective_windows,2);
assert.equal(blocked.observed.near_duplicate_windows_excluded,4);
assert.equal(blocked.gates.window_count_ready,false);
assert.equal(blocked.gates.date_diversity_ready,false);
assert.equal(blocked.gates.phase_diversity_ready,false);
assert.equal(blocked.interpretation.same_day_repetition_cannot_satisfy_date_diversity,true);
assert.equal(blocked.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  multi_day_multi_phase_required:true,
  same_day_repetition_blocked:true,
  near_duplicate_windows_excluded:true,
  passing_does_not_authorize_live_trading:true
}));
