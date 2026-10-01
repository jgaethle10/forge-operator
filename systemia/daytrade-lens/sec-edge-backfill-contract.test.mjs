import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  fileURLToPath(new URL("./sec-edge-backfill.mjs", import.meta.url)),
  "utf8"
);

assert.match(source, /loadCanonicalFrozenEnrollment/);
assert.match(source, /canonicalEnrollment\.cohorts/);
assert.match(source, /forward_paper_cohorts_regenerated:\s*false/);
assert.match(source, /current_historical_forward_paper_eligible/);
assert.doesNotMatch(source, /persistFrozenCohorts\s*\(/);
assert.doesNotMatch(source, /enrolled_at:\s*report\.generated_at/);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.sec-edge-backfill-contract-proof.v1",
  canonical_frozen_enrollment_required:true,
  historical_rerun_refreeze_forbidden:true,
  current_historical_eligibility_separated_from_frozen_enrollment:true,
  live_trade_authority:false,
}));
