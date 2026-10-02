import assert from "node:assert/strict";
import {
  fetchAlpacaOrderFillActivities,
  fetchAndBuildOrderExecutionReceipt,
} from "./edge-order-execution-fetch.mjs";

const requested=[];
const pages=[
  Array.from({length:2},(_,i)=>({
    activity_type:"FILL",
    id:"fill-"+(i+1),
    order_id:"order-1",
    symbol:"SOXX",
    side:"buy",
    type:i===0?"partial_fill":"fill",
    transaction_time:new Date(Date.UTC(2026,9,1,14,30,2+i)).toISOString(),
    qty:i===0?"2":"3",
    price:i===0?"100.10":"100.20",
    cum_qty:i===0?"2":"5",
    leaves_qty:i===0?"3":"0",
  })),
];
let call=0;
const fakeFetch=async(url,options)=>{
  requested.push({url:String(url),options});
  const payload=pages[call++]||[];
  return {
    ok:true,
    status:200,
    json:async()=>payload,
  };
};

const fetched=await fetchAlpacaOrderFillActivities({
  order_id:"order-1",
  key:"proof-key",
  secret:"proof-secret",
  page_size:100,
  fetchImpl:fakeFetch,
});
assert.equal(fetched.activity_count,2);
assert.equal(fetched.account_wide_sweep_performed,false);
assert.equal(fetched.read_only_http_method,"GET");
assert.equal(fetched.order_submission_supported,false);
assert.equal(requested.length,1);
assert.equal(requested[0].options.method,"GET");
assert.ok(requested[0].url.includes("/v2/account/activities/FILL"));
assert.ok(requested[0].url.includes("order_id=order-1"));
assert.ok(requested[0].url.includes("direction=asc"));
assert.equal(requested[0].options.body,undefined);

let receiptCall=0;
const built=await fetchAndBuildOrderExecutionReceipt({
  order:{
    order_id:"order-1",
    requested_qty:5,
    decision_time:"2026-10-01T14:30:00.000Z",
    submitted_time:"2026-10-01T14:30:01.000Z",
    decision_reference_price:100,
    expected_side:"buy",
    expected_symbol:"SOXX",
  },
  key:"proof-key",
  secret:"proof-secret",
  fetchImpl:async(url,options)=>{
    receiptCall+=1;
    assert.equal(options.method,"GET");
    assert.ok(String(url).includes("order_id=order-1"));
    return {
      ok:true,
      status:200,
      json:async()=>pages[0],
    };
  },
});
assert.equal(receiptCall,1);
assert.equal(built.fetch.activity_count,2);
assert.equal(built.receipt.execution_state,"FULL_FILL_ACTIVITY_OBSERVED");
assert.equal(built.receipt.filled_qty,5);
assert.equal(built.receipt.unfilled_qty,0);
assert.equal(built.receipt.read_only_evidence_parser,true);
assert.equal(built.live_trade_authority,false);

await assert.rejects(
  ()=>fetchAlpacaOrderFillActivities({
    key:"k",
    secret:"s",
    fetchImpl:fakeFetch,
  }),
  /order_id_required/
);

await assert.rejects(
  ()=>fetchAlpacaOrderFillActivities({
    order_id:"order-1",
    key:"k",
    secret:"s",
    base_url:"http://paper-api.alpaca.markets",
    fetchImpl:fakeFetch,
  }),
  /https_required/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.order-execution-fetch-proof.v1",
  explicit_order_id_only:true,
  fill_activity_endpoint_only:true,
  get_only:true,
  account_wide_sweep_forbidden:true,
  order_submit_cancel_replace_absent:true,
  receipt_builder_integrated:true,
  live_trade_authority:false
}));
