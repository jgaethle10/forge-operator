import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DATA_ORIGIN,
  FROZEN_SPREAD_THRESHOLD_BPS,
  expectedPhaseForSchedule,
  marketPhaseEt,
  buildDataUrl,
} from "./daytrade-practice-scheduler.mjs";

assert.equal(DATA_ORIGIN,"https://data.alpaca.markets");
assert.equal(FROZEN_SPREAD_THRESHOLD_BPS,3);

assert.equal(expectedPhaseForSchedule("45 13 * * 1-5"),"OPENING");
assert.equal(expectedPhaseForSchedule("45 14 * * 1-5"),"OPENING");
assert.equal(expectedPhaseForSchedule("30 17 * * 1-5"),"MIDDAY");
assert.equal(expectedPhaseForSchedule("30 19 * * 1-5"),"CLOSING");
assert.equal(expectedPhaseForSchedule("30 20 * * 1-5"),"CLOSING");
assert.equal(expectedPhaseForSchedule(""),"AUTO");

assert.equal(marketPhaseEt("2026-10-06T13:45:00.000Z"),"OPENING");
assert.equal(marketPhaseEt("2026-10-06T17:30:00.000Z"),"MIDDAY");
assert.equal(marketPhaseEt("2026-10-06T19:30:00.000Z"),"CLOSING");
assert.equal(marketPhaseEt("2026-10-10T17:30:00.000Z"),"WEEKEND");

const url=buildDataUrl("SOXX");
assert.equal(url.origin,"https://data.alpaca.markets");
assert.equal(url.pathname,"/v2/stocks/SOXX/quotes/latest");
assert.equal(url.searchParams.get("feed"),"iex");
assert.throws(()=>buildDataUrl("../orders"),/symbol_invalid/);

const source=fs.readFileSync(
  new URL("./daytrade-practice-scheduler.mjs",import.meta.url),
  "utf8"
);
for(const forbidden of [
  "https://api.alpaca.markets",
  "https://paper-api.alpaca.markets",
  "/v2/orders",
  "submitOrder",
  "placeOrder",
]){
  assert.equal(source.includes(forbidden),false,forbidden);
}

console.log(JSON.stringify({
  ok:true,
  market_data_origin_only:true,
  no_broker_order_host:true,
  no_order_endpoint:true,
  dst_paired_schedule_mapping:true,
  frozen_three_bps_rule:true,
  live_trade_authority:false
}));
