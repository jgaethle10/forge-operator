import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildPracticeLedgerIntegrity} from "./edge-practice-ledger-integrity.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-ledger-integrity-"));
const clean=path.join(root,"clean");
fs.mkdirSync(clean);

function write(dir,name,{run,artifact,digest,end,threshold=3,live=false}){
  fs.writeFileSync(path.join(dir,name),JSON.stringify({
    schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
    generated_at:end,
    source_run_id:run,
    source_artifact_id:artifact,
    source_artifact_digest:digest,
    simulation_only:true,
    capital_at_risk_usd:0,
    rule_id:"spread-abstention-v1",
    frozen_threshold_bps:threshold,
    live_trade_authority:live
  }));
}

write(clean,"a.json",{run:1,artifact:11,digest:"sha256:a",end:"2026-10-06T16:01:00.000Z"});
write(clean,"b.json",{run:2,artifact:12,digest:"sha256:b",end:"2026-10-06T16:03:00.000Z"});
const good=buildPracticeLedgerIntegrity({receiptDir:clean});
assert.equal(good.ok,true);
assert.equal(good.prospective_receipts,2);
assert.equal(good.independence_exclusions.physically_overlapping_windows.length,0);


const overlapOnly=path.join(root,"overlap-only");
fs.mkdirSync(overlapOnly);
write(overlapOnly,"a.json",{run:21,artifact:31,digest:"sha256:x",end:"2026-10-06T16:01:00.000Z"});
write(overlapOnly,"b.json",{run:22,artifact:32,digest:"sha256:y",end:"2026-10-06T16:01:30.000Z"});
const overlapReport=buildPracticeLedgerIntegrity({receiptDir:overlapOnly});
assert.equal(overlapReport.ok,true);
assert.equal(overlapReport.independence_exclusions.physically_overlapping_windows.length,1);

const bad=path.join(root,"bad");
fs.mkdirSync(bad);
write(bad,"a.json",{run:1,artifact:11,digest:"sha256:a",end:"2026-10-06T16:01:00.000Z"});
write(bad,"dup.json",{run:1,artifact:12,digest:"sha256:b",end:"2026-10-06T16:01:30.000Z"});
write(bad,"drift.json",{run:3,artifact:13,digest:"sha256:c",end:"2026-10-06T16:03:00.000Z",threshold:4});
const blocked=buildPracticeLedgerIntegrity({receiptDir:bad});
assert.equal(blocked.ok,false);
assert.equal(blocked.violations.duplicate_source_run_ids.length,1);
assert.ok(blocked.independence_exclusions.physically_overlapping_windows.length>=1);
assert.equal(blocked.violations.frozen_rule_drift.length,1);
assert.equal(blocked.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  duplicate_run_blocked:true,
  overlapping_window_preserved_as_independence_exclusion:true,
  frozen_rule_drift_blocked:true,
  live_trade_authority:false
}));
