import assert from "node:assert/strict";
import {
  DATA_ORIGIN,
  decisionForSpread,
  marketPhase,
  route,
} from "./scheduled-zero-capital-window.mjs";

assert.equal(DATA_ORIGIN,"https://data.alpaca.markets");
assert.equal(decisionForSpread(2.99),"SIMULATE_MARKETABLE_LONG");
assert.equal(decisionForSpread(3),"SIMULATE_MARKETABLE_LONG");
assert.equal(decisionForSpread(3.01),"ABSTAIN");

assert.equal(marketPhase("2026-10-06T13:45:00.000Z"),"OPENING");
assert.equal(marketPhase("2026-10-06T16:30:00.000Z"),"MIDDAY");
assert.equal(marketPhase("2026-10-06T19:15:00.000Z"),"CLOSING");
assert.equal(marketPhase("2026-10-06T21:00:00.000Z"),"OUTSIDE_CORE");

const long=route(
  {ask:100,bid:99.9},
  {bid:101,ask:101.1},
  20
);
assert.ok(long.pnl_usd>0);
assert.equal(long.quantity,0.2);

const src=await import("node:fs").then(fs=>fs.readFileSync(
  new URL("./scheduled-zero-capital-window.mjs",import.meta.url),"utf8"
));
assert.equal(src.includes("https://api.alpaca.markets"),false);
assert.equal(src.includes("https://paper-api.alpaca.markets"),false);
assert.equal(src.includes("/v2/orders"),false);
assert.equal(src.includes("broker_order_submitted:false"),true);
assert.equal(src.includes("live_order_submitted:false"),true);

console.log(JSON.stringify({
  ok:true,
  data_host_only:true,
  no_broker_order_endpoint:true,
  phase_classification:true,
  frozen_3bps_decision:true,
  live_trade_authority:false
}));
