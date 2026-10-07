import {spawnSync} from "node:child_process";

function clean(v){return String(v??"").trim();}
function etParts(now=new Date()){
  const p=Object.fromEntries(
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/New_York",
      weekday:"short",
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23",
    }).formatToParts(now)
      .filter(x=>x.type!=="literal")
      .map(x=>[x.type,x.value])
  );
  return {
    weekday:p.weekday,
    date:`${p.year}-${p.month}-${p.day}`,
    minuteOfDay:Number(p.hour)*60+Number(p.minute),
  };
}
function phase(parts){
  const m=parts.minuteOfDay;
  if(m>=570&&m<630) return "OPENING";
  if(m>=630&&m<900) return "MIDDAY";
  if(m>=900&&m<960) return "CLOSING";
  return "OUTSIDE_CORE";
}
async function marketClock({key,secret}){
  const r=await fetch("https://api.alpaca.markets/v2/clock",{
    method:"GET",
    headers:{
      "APCA-API-KEY-ID":key,
      "APCA-API-SECRET-KEY":secret,
      accept:"application/json",
    },
  });
  if(!r.ok) return {ok:false,http_status:r.status};
  const p=await r.json();
  return {
    ok:true,
    is_open:p?.is_open===true,
    timestamp:p?.timestamp||null,
    next_open:p?.next_open||null,
    next_close:p?.next_close||null,
  };
}

async function main(){
  const required=clean(process.env.DAYTRADE_REQUIRED_PHASE).toUpperCase();
  if(!["OPENING","MIDDAY","CLOSING"].includes(required)){
    throw new Error("scheduled_practice_required_phase_invalid");
  }
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("scheduled_practice_credentials_missing");

  const parts=etParts();
  const observedPhase=phase(parts);
  const weekdays=new Set(["Mon","Tue","Wed","Thu","Fri"]);
  const clock=await marketClock({key,secret});
  const eligible=
    weekdays.has(parts.weekday) &&
    observedPhase===required &&
    clock.ok &&
    clock.is_open===true;

  console.log(JSON.stringify({
    schema:"evercraft.daytrade.scheduled-practice-admission.v1",
    generated_at:new Date().toISOString(),
    required_phase:required,
    observed_phase:observedPhase,
    market_date_et:parts.date,
    weekday_et:parts.weekday,
    market_clock:clock,
    admitted:eligible,
    live_trade_authority:false,
  }));

  if(!eligible){
    console.log("Scheduled practice skipped: admission gate not satisfied.");
    return;
  }

  const tag=new Date().toISOString().replace(/[:.]/g,"-");
  const output=
    process.env.DAYTRADE_PROSPECTIVE_SPREAD_OUTPUT ||
    `artifacts/daytrade-edge/scheduled-${required.toLowerCase()}-${tag}.json`;

  const result=spawnSync(
    process.execPath,
    ["systemia/daytrade-lens/edge-prospective-spread-rule-practice.mjs"],
    {
      stdio:"inherit",
      env:{
        ...process.env,
        DAYTRADE_PROSPECTIVE_SPREAD_OUTPUT:output,
      },
    }
  );
  if(result.status!==0) process.exitCode=result.status??1;
}
main().catch(error=>{
  console.error("Scheduled practice runner failed:",error?.message||String(error));
  process.exitCode=1;
});
