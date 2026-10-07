import {spawnSync} from "node:child_process";

const TARGET=Date.parse("2026-10-07T18:57:30.000Z");
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function main(){
  const wait=Math.max(0,TARGET-Date.now());
  if(wait>0){
    console.log(JSON.stringify({
      waiting_for_delayed_sip:true,
      target:new Date(TARGET).toISOString(),
      wait_ms:wait
    }));
    await sleep(wait);
  }
  const result=spawnSync(
    process.execPath,
    ["systemia/daytrade-lens/edge-delayed-sip-decision-audit.test.mjs"],
    {stdio:"inherit",env:process.env}
  );
  if(result.status!==0){
    process.exitCode=result.status??1;
    return;
  }
  const audit=spawnSync(
    process.execPath,
    ["systemia/daytrade-lens/edge-delayed-sip-decision-audit.mjs"],
    {
      stdio:"inherit",
      env:{
        ...process.env,
        DAYTRADE_SIP_DECISION_AUDIT_OUTPUT:
          "artifacts/daytrade-edge/delayed-sip-decision-audit-v2-2026-10-07.json"
      }
    }
  );
  if(audit.status!==0) process.exitCode=audit.status??1;
}

main().catch(error=>{
  console.error("Delayed SIP audit v2 runner failed:",error?.message||String(error));
  process.exitCode=1;
});
