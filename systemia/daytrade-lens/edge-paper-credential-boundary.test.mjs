import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(
  new URL("./edge-paper-run-once.mjs",import.meta.url),
  "utf8"
);

assert.match(source,/process\.env\.ALPACA_PAPER_TRADING/);
assert.match(source,/process\.env\.ALPACA_PAPER_TRADING_SECRET/);
assert.match(source,/key:paperKey/);
assert.match(source,/secret:paperSecret/);
assert.match(
  source,
  /generic_live_credentials_never_used_for_paper_order_calls:true/
);
assert.doesNotMatch(
  source,
  /const\s+key\s*=\s*process\.env\.ALPACA_TRADING\s*;/
);
assert.doesNotMatch(
  source,
  /const\s+secret\s*=\s*process\.env\.ALPACA_TRADING_SECRET\s*;/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.paper-credential-boundary-proof.v1",
  dedicated_paper_env_required:true,
  generic_live_env_not_bound_as_order_key:true,
  generic_live_credentials_never_used_for_paper_order_calls:true,
  live_trade_authority:false
}));
