import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const START="2026-10-07T16:00:00.000Z";
const END="2026-10-07T16:01:00.000Z";
const OUTPUT=process.env.DAYTRADE_DELAYED_SIP_OUTPUT ||
  "artifacts/daytrade-edge/delayed-sip-diagnostic-2026-10-07.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function headers(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
async function historical(symbol,feed,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes"
  );
  url.searchParams.set("feed",feed);
  url.searchParams.set("start",START);
  url.searchParams.set("end",END);
  url.searchParams.set("sort","asc");
  url.searchParams.set("limit","1000");
  const response=await fetch(url,{headers:headers(key,secret)});
  let payload=null;
  try{payload=await response.json();}catch{}
  const quotes=Array.isArray(payload?.quotes)?payload.quotes:[];
  const q=quotes[0]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  const midpoint=bid>0&&ask>0?(bid+ask)/2:null;
  return {
    feed,
    http_status:response.status,
    ok:response.ok,
    error_code:clean(payload?.code)||null,
    error_message:clean(payload?.message)||null,
    quote_count:quotes.length,
    first_timestamp:clean(q?.t??q?.timestamp)||null,
    bid,
    ask,
    midpoint,
    spread_bps:midpoint>0&&ask>=bid?((ask-bid)/midpoint)*10000:null,
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("delayed_sip_credentials_missing");

  const rows=[];
  for(const symbol of SYMBOLS){
    const [iex,sip]=await Promise.all([
      historical(symbol,"iex",{key,secret}),
      historical(symbol,"sip",{key,secret}),
    ]);
    rows.push({
      symbol,
      iex,
      sip,
      sip_minus_iex_spread_bps:
        Number.isFinite(sip.spread_bps)&&Number.isFinite(iex.spread_bps)
          ?sip.spread_bps-iex.spread_bps
          :null,
    });
  }

  const sipReadable=rows.every(x=>x.sip.http_status===200&&x.sip.quote_count>0);
  const receipt={
    schema:"evercraft.daytrade.delayed-sip-diagnostic.v1",
    generated_at:new Date().toISOString(),
    market_window:{start:START,end:END},
    read_only:true,
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    rows,
    delayed_historical_sip_access:sipReadable
      ?"AVAILABLE"
      :"UNAVAILABLE_OR_NOT_ENTITLED",
    pilot_implication:{
      delayed_sip_can_validate_consolidated_quotes_after_the_fact:sipReadable,
      delayed_sip_cannot_drive_real_time_entry_decisions:true,
      live_recent_sip_access_still_required_for_real_time_sip_gate:true,
      iex_must_not_be_mislabeled_as_sip:true,
    },
    live_trade_authority:false,
  };
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT,
    delayed_historical_sip_access:receipt.delayed_historical_sip_access,
    rows:rows.map(x=>({
      symbol:x.symbol,
      iex_status:x.iex.http_status,
      sip_status:x.sip.http_status,
      iex_quote_count:x.iex.quote_count,
      sip_quote_count:x.sip.quote_count,
      iex_spread_bps:x.iex.spread_bps,
      sip_spread_bps:x.sip.spread_bps,
      sip_error:x.sip.error_message,
    })),
    read_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch(error=>{
  console.error("Delayed SIP diagnostic failed:",error?.message||String(error));
  process.exitCode=1;
});
