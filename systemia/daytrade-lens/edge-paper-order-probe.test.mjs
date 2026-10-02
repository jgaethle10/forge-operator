import assert from "node:assert/strict";
import {
  buildPaperOrderProbeSpec,
  submitPaperOrderProbe,
} from "./edge-paper-order-probe.mjs";

const spec=buildPaperOrderProbeSpec({
  symbol:"SOXX",
  side:"buy",
  notional_usd:20,
  client_order_id:"proof-paper-1",
});
assert.equal(spec.paper_only,true);
assert.equal(spec.live_host_allowed,false);
assert.equal(spec.live_trade_authority,false);
assert.equal(spec.base_url,"https://paper-api.alpaca.markets");
assert.equal(spec.notional_usd,20);
assert.equal(spec.max_notional_usd,20);

const dry=await submitPaperOrderProbe({
  symbol:"SOXX",
  side:"buy",
  notional_usd:20,
  client_order_id:"proof-paper-2",
});
assert.equal(dry.mode,"dry_run");
assert.equal(dry.submitted,false);
assert.equal(dry.paper_only,true);

let request=null;
const submitted=await submitPaperOrderProbe({
  symbol:"SOXX",
  side:"sell",
  notional_usd:7.5,
  client_order_id:"proof-paper-3",
  key:"paper-key",
  secret:"paper-secret",
  dry_run:false,
  fetchImpl:async(url,options)=>{
    request={url:String(url),options};
    return {
      ok:true,
      status:200,
      json:async()=>({
        id:"paper-order-123",
        status:"accepted",
        symbol:"SOXX",
        side:"sell",
        submitted_at:"2026-10-02T14:40:00.000Z",
      }),
    };
  },
});
assert.equal(submitted.mode,"paper_submit");
assert.equal(submitted.order_id,"paper-order-123");
assert.equal(submitted.capital_at_risk_usd,0);
assert.equal(submitted.live_trade_authority,false);
assert.equal(request.url,"https://paper-api.alpaca.markets/v2/orders");
assert.equal(request.options.method,"POST");
const body=JSON.parse(request.options.body);
assert.equal(body.symbol,"SOXX");
assert.equal(body.side,"sell");
assert.equal(body.notional,"7.5");
assert.equal(body.type,"market");
assert.equal(body.time_in_force,"day");

for(const forbidden of [
  "https://api.alpaca.markets",
  "https://api.alpaca.markets/",
  "http://paper-api.alpaca.markets",
  "https://paper-api.alpaca.markets:443",
]){
  assert.throws(
    ()=>buildPaperOrderProbeSpec({
      symbol:"SOXX",
      side:"buy",
      notional_usd:1,
      base_url:forbidden,
    }),
    /paper_host_required|plain_host_required/
  );
}

assert.throws(
  ()=>buildPaperOrderProbeSpec({
    symbol:"SOXX",
    side:"buy",
    notional_usd:20.01,
  }),
  /notional_exceeds_cap/
);

await assert.rejects(
  ()=>submitPaperOrderProbe({
    symbol:"SOXX",
    side:"buy",
    notional_usd:1,
    dry_run:false,
  }),
  /credentials_required/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.paper-order-probe-proof.v1",
  exact_paper_host_only:true,
  live_host_rejected:true,
  dry_run_default:true,
  paper_notional_cap_20_usd:true,
  post_only_when_explicitly_not_dry:true,
  paper_fill_not_live_fill_evidence:true,
  autonomous_live_order_authority:false,
  live_trade_authority:false
}));
