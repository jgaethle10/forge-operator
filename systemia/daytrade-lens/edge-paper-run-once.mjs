import fs from "node:fs";
import path from "node:path";
import {
  submitPaperOrderProbe,
} from "./edge-paper-order-probe.mjs";
import {
  fetchAlpacaOrderFillActivities,
} from "./edge-order-execution-fetch.mjs";

const PAPER_BASE="https://paper-api.alpaca.markets";
const DATA_BASE="https://data.alpaca.markets";
const SYMBOL="SOXX";
const NOTIONAL_USD=20;
const CLIENT_ORDER_ID="evercraft-daytrade-paper-2026-10-06-soxx-20-v1";
const OUTPUT_PATH=process.env.DAYTRADE_PAPER_PROBE_OUTPUT ||
  "artifacts/daytrade-edge/paper-probe-2026-10-06.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function headers(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
function sideShortfallBps(side,fill,reference){
  if(!(fill>0)||!(reference>0)) return null;
  return side==="buy"
    ?((fill-reference)/reference)*10000
    :((reference-fill)/reference)*10000;
}

async function latestQuote({key,secret,feed="iex"}){
  const url=new URL(`${DATA_BASE}/v2/stocks/${SYMBOL}/quotes/latest`);
  url.searchParams.set("feed",feed);
  const r=await fetch(url,{headers:headers(key,secret)});
  if(!r.ok) throw new Error(`paper_run_latest_quote_http_${r.status}`);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[SYMBOL]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("paper_run_latest_quote_invalid");
  }
  return {
    feed,
    timestamp:clean(q?.t??q?.timestamp)||null,
    bid,
    ask,
    midpoint:(bid+ask)/2,
    spread_bps:((ask-bid)/((ask+bid)/2))*10000,
  };
}

async function getOrderByClientId({key,secret}){
  const url=new URL(PAPER_BASE+"/v2/orders:by_client_order_id");
  url.searchParams.set("client_order_id",CLIENT_ORDER_ID);
  const r=await fetch(url,{headers:headers(key,secret)});
  if(r.status===404) return null;
  if(!r.ok) throw new Error(`paper_run_lookup_http_${r.status}`);
  return r.json();
}

async function getOrder({key,secret,orderId}){
  const r=await fetch(PAPER_BASE+"/v2/orders/"+encodeURIComponent(orderId),{
    headers:headers(key,secret),
  });
  if(!r.ok) throw new Error(`paper_run_order_http_${r.status}`);
  return r.json();
}

async function waitForTerminalOrder({key,secret,orderId}){
  const terminal=new Set(["filled","canceled","expired","rejected","suspended"]);
  let last=null;
  for(let i=0;i<20;i++){
    last=await getOrder({key,secret,orderId});
    if(terminal.has(clean(last?.status).toLowerCase())) return last;
    await sleep(1500);
  }
  return last;
}

async function main(){
  const paperKey=process.env.ALPACA_PAPER_TRADING;
  const paperSecret=process.env.ALPACA_PAPER_TRADING_SECRET;
  if(!paperKey||!paperSecret){
    throw new Error("paper_run_dedicated_paper_credentials_missing");
  }

  const marketDataKey=process.env.ALPACA_TRADING||paperKey;
  const marketDataSecret=process.env.ALPACA_TRADING_SECRET||paperSecret;
  if(!marketDataKey||!marketDataSecret){
    throw new Error("paper_run_market_data_credentials_missing");
  }

  const decisionAt=new Date().toISOString();
  const quote=await latestQuote({
    key:marketDataKey,
    secret:marketDataSecret,
    feed:"iex"
  });
  let order=await getOrderByClientId({key:paperKey,secret:paperSecret});
  let reusedExistingOrder=Boolean(order);
  let submission=null;

  if(!order){
    submission=await submitPaperOrderProbe({
      symbol:SYMBOL,
      side:"buy",
      notional_usd:NOTIONAL_USD,
      client_order_id:CLIENT_ORDER_ID,
      key:paperKey,
      secret:paperSecret,
      base_url:PAPER_BASE,
      max_notional_usd:20,
      dry_run:false,
    });
    order=await waitForTerminalOrder({
      key:paperKey,
      secret:paperSecret,
      orderId:submission.order_id,
    });
  }else{
    order=await waitForTerminalOrder({
      key:paperKey,
      secret:paperSecret,
      orderId:clean(order.id),
    });
  }

  if(!order?.id) throw new Error("paper_run_order_missing");
  const fills=await fetchAlpacaOrderFillActivities({
    order_id:order.id,
    key:paperKey,
    secret:paperSecret,
    base_url:PAPER_BASE,
  });

  const filledQty=finite(order.filled_qty)??0;
  const filledAvgPrice=finite(order.filled_avg_price);
  const filledNotional=
    filledQty>0&&filledAvgPrice>0?filledQty*filledAvgPrice:0;
  const reference=quote.midpoint;
  const shortfallBps=
    filledAvgPrice>0?sideShortfallBps("buy",filledAvgPrice,reference):null;
  const decisionMs=new Date(decisionAt).getTime();
  const firstFillTime=fills.activities
    .map(x=>x?.transaction_time??x?.executed_at??x?.timestamp)
    .filter(Boolean)
    .map(x=>new Date(x))
    .filter(x=>Number.isFinite(x.getTime()))
    .sort((a,b)=>a-b)[0]||null;

  const receipt={
    schema:"evercraft.daytrade.paper-run-receipt.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    credential_boundary:{
      paper_credentials_source:"ALPACA_PAPER_TRADING + ALPACA_PAPER_TRADING_SECRET",
      market_data_credentials_source:
        process.env.ALPACA_TRADING&&process.env.ALPACA_TRADING_SECRET
          ?"ALPACA_TRADING read-only market data"
          :"dedicated paper credentials",
      generic_live_credentials_never_used_for_paper_order_calls:true,
    },
    requested_paper_notional_usd:NOTIONAL_USD,
    symbol:SYMBOL,
    side:"buy",
    frozen_protocol_reference:{
      signal_key:"ai_models|sec_8_k|SOXX|1d",
      cohort_id:"edgepaper_29a22b58b874a6e2e67f",
      learned_direction:"POSITIVE_EXCESS_RETURN",
      protocol_hash:"29a22b58b874a6e2e67f335ce623907533236a0661661fbca5f51a593a80a50a",
      protocol_live_trade_authority:false,
    },
    client_order_id:CLIENT_ORDER_ID,
    reused_existing_order:reusedExistingOrder,
    decision_time:decisionAt,
    decision_quote:quote,
    provider_order:{
      id:clean(order.id),
      status:clean(order.status),
      submitted_at:clean(order.submitted_at)||null,
      filled_at:clean(order.filled_at)||null,
      filled_qty:filledQty,
      filled_avg_price:filledAvgPrice,
      filled_notional_usd:filledNotional,
      notional:finite(order.notional),
      time_in_force:clean(order.time_in_force)||null,
      type:clean(order.type)||null,
    },
    order_specific_fill_activity_count:fills.activity_count,
    decision_to_first_fill_ms:firstFillTime
      ?firstFillTime.getTime()-decisionMs
      :null,
    marketable_buy_reference:"decision midpoint from Alpaca IEX latest quote",
    implementation_shortfall_bps_vs_decision_midpoint:shortfallBps,
    requested_notional_minus_filled_notional_usd:
      NOTIONAL_USD-filledNotional,
    interpretation:{
      paper_fill_is_not_live_fill_quality_evidence:true,
      paper_fill_is_not_profitability_evidence:true,
      live_queue_position_unobserved:true,
      live_market_impact_unobserved:true,
      purpose:"Validate order submission, provider acknowledgement, fill capture and decision-to-fill measurement plumbing with zero real capital.",
    },
    autonomous_live_order_authority:false,
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH),{recursive:true});
  fs.writeFileSync(OUTPUT_PATH,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT_PATH,
    status:receipt.provider_order.status,
    requested_paper_notional_usd:NOTIONAL_USD,
    filled_qty:filledQty,
    filled_avg_price:filledAvgPrice,
    implementation_shortfall_bps_vs_decision_midpoint:shortfallBps,
    reused_existing_order:reusedExistingOrder,
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}

main().catch((error)=>{
  console.error("Paper run failed:",error?.message||String(error));
  process.exitCode=1;
});
