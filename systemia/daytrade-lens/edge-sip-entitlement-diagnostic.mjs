import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const OUTPUT=process.env.DAYTRADE_SIP_DIAGNOSTIC_OUTPUT ||
  "artifacts/daytrade-edge/sip-entitlement-diagnostic-2026-10-07.json";

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
async function latest(symbol,feed,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed",feed);
  const response=await fetch(url,{headers:headers(key,secret)});
  let payload=null;
  try{payload=await response.json();}catch{}
  const q=payload?.quote||payload?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  const midpoint=bid>0&&ask>0?(bid+ask)/2:null;
  return {
    feed,
    http_status:response.status,
    ok:response.ok,
    error_code:clean(payload?.code)||null,
    error_message:clean(payload?.message)||null,
    timestamp:clean(q?.t??q?.timestamp)||null,
    bid,
    ask,
    midpoint,
    spread_bps:midpoint>0&&ask>=bid?((ask-bid)/midpoint)*10000:null,
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("sip_diagnostic_credentials_missing");

  const rows=[];
  for(const symbol of SYMBOLS){
    const [iex,sip]=await Promise.all([
      latest(symbol,"iex",{key,secret}),
      latest(symbol,"sip",{key,secret}),
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

  const sipReadable=rows.every(x=>x.sip.http_status===200);
  const receipt={
    schema:"evercraft.daytrade.sip-entitlement-diagnostic.v1",
    generated_at:new Date().toISOString(),
    read_only:true,
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    symbols:SYMBOLS,
    rows,
    sip_latest_quote_access:sipReadable
      ?"AVAILABLE"
      :"UNAVAILABLE_OR_NOT_ENTITLED",
    pilot_implication:{
      consolidated_sip_quote_access_confirmed:sipReadable,
      iex_must_not_be_mislabeled_as_sip:true,
      successful_sip_read_does_not_validate_live_execution:true,
      failed_sip_read_is_a_data_entitlement_blocker:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT,
    sip_latest_quote_access:receipt.sip_latest_quote_access,
    rows:rows.map(x=>({
      symbol:x.symbol,
      iex_status:x.iex.http_status,
      sip_status:x.sip.http_status,
      iex_spread_bps:x.iex.spread_bps,
      sip_spread_bps:x.sip.spread_bps,
      sip_error:x.sip.error_message,
    })),
    read_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch(error=>{
  console.error("SIP diagnostic failed:",error?.message||String(error));
  process.exitCode=1;
});
