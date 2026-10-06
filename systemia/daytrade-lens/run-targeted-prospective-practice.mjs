import {spawnSync} from "node:child_process";

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function main(){
  const targetRaw=process.env.DAYTRADE_PRACTICE_TARGET_UTC;
  if(!targetRaw) throw new Error("targeted_practice_target_required");
  const targetMs=Date.parse(targetRaw);
  if(!Number.isFinite(targetMs)) throw new Error("targeted_practice_target_invalid");

  const now=Date.now();
  const wait=Math.max(0,targetMs-now);
  if(wait>0){
    console.log(JSON.stringify({
      waiting_for_target:true,
      now:new Date(now).toISOString(),
      target:new Date(targetMs).toISOString(),
      wait_ms:wait
    }));
    await sleep(wait);
  }

  const result=spawnSync(
    process.execPath,
    ["systemia/daytrade-lens/edge-prospective-spread-rule-practice.mjs"],
    {
      stdio:"inherit",
      env:{...process.env}
    }
  );
  if(result.status!==0) process.exitCode=result.status??1;
}
main().catch(error=>{
  console.error("Targeted prospective practice failed:",error?.message||String(error));
  process.exitCode=1;
});
