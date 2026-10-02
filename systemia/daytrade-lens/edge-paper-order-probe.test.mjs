import assert from "node:assert/strict";
import {
  buildPaperOrderProbeSpec,
  submitPaperOrderProbe,
} from "./edge-paper-order-probe.mjs";
import {
  fetchAndBuildOrderExecutionReceipt,
} from "./edge-order-execution-fetch.mjs";

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

const chained=await fetchAndBuildOrderExecutionReceipt({
  order:{
    order_id:submitted.order_id,
    requested_qty:0.075,
    decision_time:"2026-10-02T14:39:59.000Z",
    submitted_time:"2026-10-02T14:40:00.000Z",
    decision_reference_price:100,
    expected_side:"sell",
    expected_symbol:"SOXX",
    terminal_status:"canceled",
    terminal_time:"2026-10-02T14:40:10.000Z",
    terminal_reference_price:99.80,
  },
  key:"paper-key",
  secret:"paper-secret",
  fetchImpl:async(url,options)=>{
    assert.equal(options.method,"GET");
    assert.ok(String(url).includes("order_id=paper-order-123"));
    return {
      ok:true,
      status:200,
      json:async()=>[
        {
          activity_type:"FILL",
          id:"paper-fill-1",
          order_id:"paper-order-123",
          symbol:"SOXX",
          side:"sell",
          type:"partial_fill",
          transaction_time:"2026-10-02T14:40:03.000Z",
          qty:"0.05",
          price:"99.90",
          cum_qty:"0.05",
          leaves_qty:"0.025",
        },
      ],
    };
  },
});
assert.equal(chained.receipt.execution_state,"PARTIAL_FILL_ACTIVITY_OBSERVED");
assert.equal(chained.receipt.filled_qty,0.05);
assert.ok(Math.abs(chained.receipt.unfilled_qty-0.025)<1e-12);
assert.equal(chained.receipt.unfilled_remainder_opportunity_cost_measured,true);
assert.equal(chained.receipt.total_implementation_shortfall_complete,true);
assert.equal(chained.receipt.live_trade_authority,false);

for(const forbidden of [
  "https://api.alpaca.markets",
  "https://api.alpaca.markets/",
  "http://paper-api.alpaca.markets",
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
  paper_order_to_receipt_chain:true,
  partial_fill_receipt_chain:true,
  autonomous_live_order_authority:false,
  live_trade_authority:false
}));
