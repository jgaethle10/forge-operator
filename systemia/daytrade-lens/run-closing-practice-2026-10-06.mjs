import {spawnSync} from "node:child_process";

const TARGET_MS=Date.parse("2026-10-06T19:00:05.000Z");

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function main(){
  const now=Date.now();
  const wait=Math.max(0,TARGET_MS-now);
  if(wait>0){
    console.log(JSON.stringify({
      waiting_for_closing_phase:true,
      now:new Date(now).toISOString(),
      target:new Date(TARGET_MS).toISOString(),
      wait_ms:wait
    }));
    await sleep(wait);
  }

  const result=spawnSync(
    process.execPath,
    ["systemia/daytrade-lens/edge-prospective-spread-rule-practice.mjs"],
    {
      stdio:"inherit",
      env:{
        ...process.env,
        DAYTRADE_PROSPECTIVE_SPREAD_OUTPUT:
          process.env.DAYTRADE_PROSPECTIVE_SPREAD_OUTPUT ||
          "artifacts/daytrade-edge/prospective-spread-rule-practice-2026-10-06-closing.json"
      }
    }
  );

  if(result.status!==0){
    process.exitCode=result.status??1;
    return;
  }
}
main().catch(error=>{
  console.error("Closing practice runner failed:",error?.message||String(error));
  process.exitCode=1;
});
