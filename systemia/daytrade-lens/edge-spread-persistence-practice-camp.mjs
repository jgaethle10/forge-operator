import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const THRESHOLDS_BPS=[0.5,1,2,3,5];
const NOTIONAL_USD=20;
const SAMPLE_COUNT=7;
const SAMPLE_INTERVAL_MS=20000;
const OUTPUT=process.env.DAYTRADE_SPREAD_PERSISTENCE_OUTPUT ||
  "artifacts/daytrade-edge/spread-persistence-practice-2026-10-06-d.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function median(xs){
  if(!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function sd(xs){
  if(xs.length<2) return null;
  const m=mean(xs);
  return Math.sqrt(xs.reduce((a,x)=>a+(x-m)**2,0)/(xs.length-1));
}
function headers(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
async function latestQuote(symbol,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok) throw new Error("spread_persistence_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("spread_persistence_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
async function snapshot(index,{key,secret}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    SYMBOLS.map(async symbol=>[symbol,await latestQuote(symbol,{key,secret})])
  );
  return {index,observed_at,quotes:Object.fromEntries(pairs)};
}
function route(entryQuote,exitQuote){
  const qty=NOTIONAL_USD/entryQuote.ask;
  const exitValue=qty*exitQuote.bid;
  const pnl=exitValue-NOTIONAL_USD;
  return {
    entry_ask:entryQuote.ask,
    exit_bid:exitQuote.bid,
    simulated_quantity:qty,
    pnl_usd:pnl,
    return_pct:pnl/NOTIONAL_USD*100,
  };
}
function symbolSummary(symbol,snapshots){
  const quotes=snapshots.map(x=>x.quotes[symbol]);
  const spreads=quotes.map(x=>x.spread_bps);
  const mids=quotes.map(x=>x.midpoint);
  const final=quotes.at(-1);
  const routes=quotes.slice(0,-1).map((q,i)=>({
    sample_index:i,
    sample_time:snapshots[i].observed_at,
    spread_bps:q.spread_bps,
    ...route(q,final),
  }));
  const grid=THRESHOLDS_BPS.map(threshold=>{
    const eligible=quotes
      .map((q,i)=>({i,q}))
      .filter(x=>x.q.spread_bps<=threshold);
    return {
      max_spread_bps:threshold,
      eligible_sample_count:eligible.length,
      eligible_sample_fraction:eligible.length/quotes.length,
      eligible_sample_indices:eligible.map(x=>x.i),
      gate_state_changes:quotes.reduce((count,q,i)=>{
        if(i===0) return 0;
        const prev=quotes[i-1].spread_bps<=threshold;
        const cur=q.spread_bps<=threshold;
        return count+(prev!==cur?1:0);
      },0),
    };
  });
  return {
    symbol,
    spread_bps:{
      mean:mean(spreads),
      median:median(spreads),
      min:Math.min(...spreads),
      max:Math.max(...spreads),
      sd:sd(spreads),
      range:Math.max(...spreads)-Math.min(...spreads),
    },
    midpoint:{
      start:mids[0],
      end:mids.at(-1),
      change_bps:((mids.at(-1)-mids[0])/mids[0])*10000,
      min:Math.min(...mids),
      max:Math.max(...mids),
    },
    threshold_stability:grid,
    same_exit_entry_timing_routes:routes,
    hindsight_best_entry_pnl_usd:Math.max(...routes.map(x=>x.pnl_usd)),
    hindsight_worst_entry_pnl_usd:Math.min(...routes.map(x=>x.pnl_usd)),
    hindsight_optimization_prohibited:true,
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("spread_persistence_credentials_missing");

  const snapshots=[];
  for(let i=0;i<SAMPLE_COUNT;i++){
    snapshots.push(await snapshot(i,{key,secret}));
    if(i<SAMPLE_COUNT-1) await sleep(SAMPLE_INTERVAL_MS);
  }

  const summaries=SYMBOLS.map(symbol=>symbolSummary(symbol,snapshots));
  const receipt={
    schema:"evercraft.daytrade.spread-persistence-practice-camp.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    symbols:SYMBOLS,
    notional_per_route_usd:NOTIONAL_USD,
    sample_count:SAMPLE_COUNT,
    sample_interval_ms:SAMPLE_INTERVAL_MS,
    thresholds_bps:THRESHOLDS_BPS,
    snapshots,
    summaries,
    lessons:{
      spread_gate_stability_measured:true,
      repeated_snapshots_reduce_single_quote_storytelling:true,
      same_exit_timing_routes_are_hindsight_diagnostics_only:true,
      thresholds_not_optimized_or_live_authorized:true,
      arbitrary_intraday_rehearsal_not_signal_validation:true,
      iex_is_not_consolidated_sip_nbbo:true,
      observed_quote_touch_not_real_fill:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");

  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    sample_count:SAMPLE_COUNT,
    sample_interval_ms:SAMPLE_INTERVAL_MS,
    summaries:summaries.map(x=>({
      symbol:x.symbol,
      mean_spread_bps:x.spread_bps.mean,
      min_spread_bps:x.spread_bps.min,
      max_spread_bps:x.spread_bps.max,
      spread_range_bps:x.spread_bps.range,
      midpoint_change_bps:x.midpoint.change_bps,
      threshold_stability:x.threshold_stability,
      hindsight_best_entry_pnl_usd:x.hindsight_best_entry_pnl_usd,
      hindsight_worst_entry_pnl_usd:x.hindsight_worst_entry_pnl_usd,
    })),
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Spread-persistence practice failed:",error?.message||String(error));
  process.exitCode=1;
});
