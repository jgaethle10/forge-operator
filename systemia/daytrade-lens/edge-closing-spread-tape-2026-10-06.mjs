import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ","SPY"];
const SAMPLE_COUNT=7;
const SAMPLE_INTERVAL_MS=20000;
const TARGET_MS=Date.parse("2026-10-06T19:00:05.000Z");
const OUTPUT=process.env.DAYTRADE_CLOSING_TAPE_OUTPUT ||
  "artifacts/daytrade-edge/closing-spread-tape-2026-10-06.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function median(xs){
  if(!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function headers(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
async function quote(symbol,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok) throw new Error("closing_tape_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("closing_tape_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
function etParts(timestamp){
  const d=new Date(timestamp);
  const fmt=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  });
  const p=Object.fromEntries(
    fmt.formatToParts(d)
      .filter(x=>x.type!=="literal")
      .map(x=>[x.type,x.value])
  );
  return {
    date:`${p.year}-${p.month}-${p.day}`,
    time:`${p.hour}:${p.minute}:${p.second}`,
    minute_of_day:Number(p.hour)*60+Number(p.minute),
  };
}
async function snapshot(index,{key,secret}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    SYMBOLS.map(async symbol=>[symbol,await quote(symbol,{key,secret})])
  );
  return {
    index,
    observed_at,
    et:etParts(observed_at),
    quotes:Object.fromEntries(pairs),
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("closing_tape_credentials_missing");

  const wait=Math.max(0,TARGET_MS-Date.now());
  if(wait>0) await sleep(wait);

  const snapshots=[];
  for(let i=0;i<SAMPLE_COUNT;i++){
    snapshots.push(await snapshot(i,{key,secret}));
    if(i<SAMPLE_COUNT-1) await sleep(SAMPLE_INTERVAL_MS);
  }

  const summaries=SYMBOLS.map(symbol=>{
    const quotes=snapshots.map(s=>s.quotes[symbol]);
    const spreads=quotes.map(q=>q.spread_bps);
    const mids=quotes.map(q=>q.midpoint);
    return {
      symbol,
      spread_bps:{
        mean:mean(spreads),
        median:median(spreads),
        min:Math.min(...spreads),
        max:Math.max(...spreads),
        start:spreads[0],
        end:spreads.at(-1),
        change:spreads.at(-1)-spreads[0],
      },
      midpoint:{
        start:mids[0],
        end:mids.at(-1),
        change_bps:((mids.at(-1)-mids[0])/mids[0])*10000,
      },
      samples_at_or_below_3bps:spreads.filter(x=>x<=3).length,
      samples_above_3bps:spreads.filter(x=>x>3).length,
    };
  });

  const receipt={
    schema:"evercraft.daytrade.closing-spread-tape.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    market_phase:"CLOSING",
    target_phase_start_et:"15:00:00",
    sample_count:SAMPLE_COUNT,
    sample_interval_ms:SAMPLE_INTERVAL_MS,
    symbols:SYMBOLS,
    snapshots,
    summaries,
    controls:{
      same_frozen_3bps_reference:true,
      tape_does_not_authorize_rule:true,
      tape_does_not_validate_signal:true,
      iex_is_not_consolidated_sip_nbbo:true,
      live_trade_authority:false,
    },
    live_trade_authority:false
  };
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT,
    summaries,
    sample_phase_times:snapshots.map(s=>s.et),
    capital_at_risk_usd:0
  }));
}
main().catch(error=>{
  console.error("Closing tape failed:",error?.message||String(error));
  process.exitCode=1;
});
