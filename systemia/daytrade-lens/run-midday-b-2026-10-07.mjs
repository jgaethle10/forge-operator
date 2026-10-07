import {spawnSync} from "node:child_process";
const TARGET=Date.parse("2026-10-07T16:05:30.000Z");
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function main(){
  const wait=Math.max(0,TARGET-Date.now());
  if(wait>0){
    console.log(JSON.stringify({
      waiting_for_independent_window:true,
      target:new Date(TARGET).toISOString(),
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
          "artifacts/daytrade-edge/prospective-spread-rule-practice-2026-10-07-midday-b.json"
      }
    }
  );
  if(result.status!==0) process.exitCode=result.status??1;
}
main().catch(error=>{
  console.error("Midday B runner failed:",error?.message||String(error));
  process.exitCode=1;
});
