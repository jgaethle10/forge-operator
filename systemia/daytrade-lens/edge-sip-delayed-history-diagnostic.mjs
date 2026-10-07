import fs from "node:fs";
import path from "node:path";
import {
  fetchAlpacaQuotes,
  quoteAtOrAfter,
} from "./edge-quote-microstructure.mjs";

const SYMBOLS=["SOXX","SMH","QQQ"];
const TARGET="2026-10-07T16:06:00.000Z";
const START="2026-10-07T16:05:55.000Z";
const END="2026-10-07T16:06:35.000Z";
const OUTPUT=process.env.DAYTRADE_SIP_DELAYED_OUTPUT ||
  "artifacts/daytrade-edge/sip-delayed-history-diagnostic-2026-10-07.json";

async function get(symbol,feed,{key,secret}){
  try{
    const rows=await fetchAlpacaQuotes(symbol,{
      start:START,end:END,key,secret,feed
    });
    const q=quoteAtOrAfter(rows,TARGET,{max_delay_ms:30000});
    return {
      ok:true,
      row_count:rows.length,
      quote:q,
      error:null,
      status:null,
    };
  }catch(error){
    return {
      ok:false,
      row_count:0,
      quote:null,
      error:error?.message||String(error),
      status:error?.status??null,
    };
  }
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("sip_delayed_credentials_missing");

  const rows=[];
  for(const symbol of SYMBOLS){
    const [iex,sip]=await Promise.all([
      get(symbol,"iex",{key,secret}),
      get(symbol,"sip",{key,secret}),
    ]);
    rows.push({symbol,iex,sip});
  }

  const sipHistoricalReadable=rows.every(x=>x.sip.ok&&x.sip.quote);
  const receipt={
    schema:"evercraft.daytrade.sip-delayed-history-diagnostic.v1",
    generated_at:new Date().toISOString(),
    target_timestamp:TARGET,
    query_start:START,
    query_end:END,
    read_only:true,
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    rows,
    delayed_historical_sip_access:
      sipHistoricalReadable?"AVAILABLE":"UNAVAILABLE",
    implication:{
      recent_sip_was_403:true,
      delayed_historical_sip_read_confirmed:sipHistoricalReadable,
      delayed_sip_cannot_drive_real_time_decision:true,
      delayed_sip_can_validate_consolidated_nbbo_after_the_fact:
        sipHistoricalReadable,
      no_silent_iex_to_sip_upgrade:true,
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
      iex_ok:x.iex.ok,
      sip_ok:x.sip.ok,
      sip_status:x.sip.status,
      sip_error:x.sip.error,
      iex_spread_bps:x.iex.quote?.spread_bps??null,
      sip_spread_bps:x.sip.quote?.spread_bps??null,
    })),
    capital_at_risk_usd:0,
  }));
}

main().catch(error=>{
  console.error("Delayed SIP diagnostic failed:",error?.message||String(error));
  process.exitCode=1;
});
