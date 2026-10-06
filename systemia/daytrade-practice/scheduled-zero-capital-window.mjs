import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const SYMBOLS=["SOXX","SMH","QQQ"];
export const THRESHOLD_BPS=3;
export const NOTIONAL_USD=20;
export const HOLD_MS=60000;
export const DATA_ORIGIN="https://data.alpaca.markets";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function authHeaders(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
function etParts(timestamp){
  const d=new Date(timestamp);
  if(!Number.isFinite(d.getTime())) return null;
  const fmt=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  });
  const p=Object.fromEntries(
    fmt.formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value])
  );
  return {
    date:`${p.year}-${p.month}-${p.day}`,
    hour:Number(p.hour),
    minute:Number(p.minute),
    second:Number(p.second),
  };
}
export function marketPhase(timestamp){
  const p=etParts(timestamp);
  if(!p) return "UNKNOWN";
  const minute=p.hour*60+p.minute;
  if(minute>=570&&minute<630) return "OPENING";
  if(minute>=630&&minute<900) return "MIDDAY";
  if(minute>=900&&minute<960) return "CLOSING";
  return "OUTSIDE_CORE";
}
export function decisionForSpread(spreadBps,threshold=THRESHOLD_BPS){
  return Number(spreadBps)<=Number(threshold)
    ?"SIMULATE_MARKETABLE_LONG"
    :"ABSTAIN";
}
export function route(entry,exit,notional=NOTIONAL_USD){
  const qty=Number(notional)/entry.ask;
  const exitValue=qty*exit.bid;
  const pnl=exitValue-Number(notional);
  return {
    entry_ask:entry.ask,
    exit_bid:exit.bid,
    quantity:qty,
    exit_value_usd:exitValue,
    pnl_usd:pnl,
    return_pct:pnl/Number(notional)*100,
  };
}
async function latestQuote(symbol,{key,secret,fetchImpl=fetch}){
  const url=new URL(DATA_ORIGIN+"/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest");
  if(url.origin!==DATA_ORIGIN) throw new Error("data_origin_guard_failed");
  url.searchParams.set("feed","iex");
  const r=await fetchImpl(url,{method:"GET",headers:authHeaders(key,secret)});
  if(!r.ok) throw new Error(`scheduled_quote_${symbol}_http_${r.status}`);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  const timestamp=clean(q?.t??q?.timestamp);
  if(!(bid>0)||!(ask>0)||ask<bid||!timestamp){
    throw new Error(`scheduled_quote_${symbol}_invalid`);
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp,bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
async function snapshot({key,secret}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    SYMBOLS.map(async symbol=>[symbol,await latestQuote(symbol,{key,secret})])
  );
  return {observed_at,quotes:Object.fromEntries(pairs)};
}
function quoteFresh(quote,nowMs){
  const t=Date.parse(quote?.timestamp);
  if(!Number.isFinite(t)) return false;
  const age=nowMs-t;
  return age>=-5000&&age<=120000;
}
function snapshotsFresh(snapshot){
  const now=Date.parse(snapshot.observed_at);
  const nowEt=etParts(snapshot.observed_at);
  return SYMBOLS.every(symbol=>{
    const q=snapshot.quotes[symbol];
    const qp=etParts(q?.timestamp);
    return quoteFresh(q,now)&&qp?.date===nowEt?.date;
  });
}
function safeFileName(value){
  return String(value).replace(/[^A-Za-z0-9_.-]+/g,"_");
}
function markdown(receipt){
  const a=receipt.aggregate||{};
  const lines=[
    `### DayTrade zero-capital practice — ${receipt.generated_at}`,
    "",
    `- phase: **${receipt.market_phase_et}**`,
    `- status: **${receipt.status}**`,
    `- real capital at risk: **$0**`,
    `- frozen spread threshold: **${receipt.threshold_bps} bps**`,
  ];
  if(receipt.status==="COMPLETED"){
    lines.push(
      `- traded: **${a.traded_count}**; abstained: **${a.abstained_count}**`,
      `- governed simulated P&L: **$${Number(a.governed_total_pnl_usd).toFixed(6)}**`,
      `- always-cross counterfactual: **$${Number(a.always_cross_total_pnl_usd).toFixed(6)}**`,
      `- rule improvement vs always-cross: **$${Number(a.rule_improvement_vs_always_cross_usd).toFixed(6)}**`,
      "",
      "| Symbol | Spread bps | Decision | Governed P&L | Always-cross P&L |",
      "|---|---:|---|---:|---:|",
      ...receipt.rows.map(r=>
        `| ${r.symbol} | ${r.entry_spread_bps.toFixed(3)} | ${r.decision} | $${r.governed_route.pnl_usd.toFixed(6)} | $${r.always_cross_counterfactual.pnl_usd.toFixed(6)} |`
      )
    );
  }else{
    lines.push(`- skip reason: **${receipt.skip_reason}**`);
  }
  lines.push(
    "",
    "Controls: market-data simulation only; IEX is not SIP/NBBO; no broker order endpoint used; live_trade_authority=false.",
    `GitHub run: ${process.env.GITHUB_RUN_ID||"unknown"}`
  );
  return lines.join("\n")+"\n";
}
async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("scheduled_practice_credentials_missing");

  const expected=clean(process.env.DAYTRADE_EXPECTED_PHASE||"AUTO").toUpperCase();
  const outputDir=process.env.DAYTRADE_PRACTICE_OUTPUT_DIR||
    "artifacts/daytrade-practice";
  const entry=await snapshot({key,secret});
  const phase=marketPhase(entry.observed_at);
  const statusBase={
    schema:"evercraft.daytrade.scheduled-zero-capital-window.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    data_origin:DATA_ORIGIN,
    symbols:SYMBOLS,
    threshold_bps:THRESHOLD_BPS,
    notional_per_symbol_usd:NOTIONAL_USD,
    hold_ms:HOLD_MS,
    market_phase_et:phase,
    expected_market_phase_et:expected,
    live_trade_authority:false,
  };

  let receipt;
  if(!snapshotsFresh(entry)){
    receipt={...statusBase,status:"SKIPPED",skip_reason:"MARKET_CLOSED_OR_DATA_STALE",entry_snapshot:entry};
  }else if(expected!=="AUTO"&&phase!==expected){
    receipt={...statusBase,status:"SKIPPED",skip_reason:"UNEXPECTED_MARKET_PHASE",entry_snapshot:entry};
  }else if(!["OPENING","MIDDAY","CLOSING"].includes(phase)){
    receipt={...statusBase,status:"SKIPPED",skip_reason:"OUTSIDE_CORE_MARKET_PHASE",entry_snapshot:entry};
  }else{
    const decisions=SYMBOLS.map(symbol=>({
      symbol,
      entry_spread_bps:entry.quotes[symbol].spread_bps,
      decision:decisionForSpread(entry.quotes[symbol].spread_bps),
    }));
    await sleep(HOLD_MS);
    const exit=await snapshot({key,secret});
    if(!snapshotsFresh(exit)){
      receipt={...statusBase,status:"SKIPPED",skip_reason:"EXIT_DATA_STALE",entry_snapshot:entry,exit_snapshot:exit};
    }else{
      const rows=decisions.map(d=>{
        const always=route(entry.quotes[d.symbol],exit.quotes[d.symbol]);
        const governed=d.decision==="SIMULATE_MARKETABLE_LONG"
          ?always
          :{entry_ask:null,exit_bid:null,quantity:0,exit_value_usd:NOTIONAL_USD,pnl_usd:0,return_pct:0,abstained:true};
        return {
          ...d,
          entry_quote:entry.quotes[d.symbol],
          exit_quote:exit.quotes[d.symbol],
          governed_route:governed,
          always_cross_counterfactual:always,
          avoided_pnl_usd:governed.pnl_usd-always.pnl_usd,
        };
      });
      const sum=xs=>xs.reduce((a,b)=>a+b,0);
      const governed=sum(rows.map(r=>r.governed_route.pnl_usd));
      const always=sum(rows.map(r=>r.always_cross_counterfactual.pnl_usd));
      receipt={
        ...statusBase,status:"COMPLETED",
        entry_snapshot:entry,exit_snapshot:exit,rows,
        aggregate:{
          traded_count:rows.filter(r=>r.decision==="SIMULATE_MARKETABLE_LONG").length,
          abstained_count:rows.filter(r=>r.decision==="ABSTAIN").length,
          governed_total_pnl_usd:governed,
          always_cross_total_pnl_usd:always,
          rule_improvement_vs_always_cross_usd:governed-always,
        },
        interpretation:{
          frozen_rule_unchanged:true,
          practice_not_signal_validation:true,
          practice_not_live_fill_validation:true,
          iex_is_not_consolidated_sip_nbbo:true,
        }
      };
    }
  }

  fs.mkdirSync(outputDir,{recursive:true});
  const stem=safeFileName(
    `${receipt.generated_at}-${receipt.market_phase_et}-${receipt.status}`
  );
  const jsonPath=path.join(outputDir,stem+".json");
  const mdPath=path.join(outputDir,stem+".md");
  fs.writeFileSync(jsonPath,JSON.stringify(receipt,null,2)+"\n");
  fs.writeFileSync(mdPath,markdown(receipt));
  console.log(JSON.stringify({
    ok:true,status:receipt.status,phase:receipt.market_phase_et,
    json_path:jsonPath,markdown_path:mdPath,
    aggregate:receipt.aggregate||null,
    live_trade_authority:false
  }));
}
if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Scheduled practice failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
