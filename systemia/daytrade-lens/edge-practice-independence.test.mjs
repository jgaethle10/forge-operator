import assert from "node:assert/strict";
import {
  selectIndependentPracticeWindows,
} from "./edge-practice-independence.mjs";

const rows=[
  {file:"a.json",generated_at:"2026-10-06T16:00:00.000Z"},
  {file:"b.json",generated_at:"2026-10-06T16:02:00.000Z"},
  {file:"c.json",generated_at:"2026-10-06T16:05:00.000Z"},
  {file:"d.json",generated_at:"2026-10-06T16:08:30.000Z"},
];

const report=selectIndependentPracticeWindows(rows);
assert.equal(report.minimum_separation_ms,180000);
assert.equal(report.raw_count,4);
assert.equal(report.independent_count,3);
assert.equal(report.excluded_count,1);
assert.deepEqual(
  report.independent.map(x=>x.file),
  ["a.json","c.json","d.json"]
);
assert.equal(report.excluded[0].file,"b.json");
assert.equal(report.excluded[0].nearest_selected_file,"a.json");
assert.equal(report.excluded[0].separation_ms,120000);

console.log(JSON.stringify({
  ok:true,
  three_minute_independence_gate:true,
  near_duplicate_preserved_but_excluded:true,
}));
