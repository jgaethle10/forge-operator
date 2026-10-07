import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDemo } from "./demo.mjs";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const html=fs.readFileSync(path.join(__dirname,"public","index.html"),"utf8");

function boundedInteger(value,fallback,min,max){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)) return fallback;
  return Math.max(min,Math.min(max,Math.floor(parsed)));
}
function configured(env){
  return Boolean(env.NEBIUS_TOKEN_FACTORY_KEY||env.NEBIUS_API_KEY);
}
function enabled(env){
  return String(env.RUNBOOK_ZERO_DEMO_ENABLED||"").trim()==="1";
}
function providerOptions(env){
  return {
    apiKey:env.NEBIUS_TOKEN_FACTORY_KEY||env.NEBIUS_API_KEY||"",
    baseUrl:env.NEBIUS_TOKEN_FACTORY_BASE_URL,
    model:env.NEBIUS_MODEL,
  };
}
function send(res,status,body,type="application/json; charset=utf-8",headers={}){
  res.statusCode=status;
  res.setHeader("content-type",type);
  res.setHeader("cache-control","no-store");
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy","default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
  for(const [key,value] of Object.entries(headers)) res.setHeader(key,value);
  res.end(type.startsWith("application/json")?JSON.stringify(body,null,2):body);
}

export function createRunbookZeroServer({
  env=process.env,
  runDemoImpl=runDemo,
  now=()=>Date.now(),
}={}){
  const maxRuns=boundedInteger(env.RUNBOOK_ZERO_DEMO_MAX_RUNS,25,1,100);
  const cooldownMs=boundedInteger(env.RUNBOOK_ZERO_DEMO_COOLDOWN_MS,4000,0,60_000);
  let busy=false;
  let runCount=0;
  let lastRunAt=0;

  return http.createServer(async(req,res)=>{
    const url=new URL(req.url||"/","http://localhost");

    if(req.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html")){
      send(res,200,html,"text/html; charset=utf-8");
      return;
    }

    if(req.method==="GET"&&url.pathname==="/health"){
      send(res,200,{
        ok:true,
        product:"Runbook Zero",
        nebius_configured:configured(env),
        demo_enabled:enabled(env),
        model:env.NEBIUS_MODEL||"nvidia/nemotron-3-super-120b-a12b",
        arbitrary_shell_from_model:false,
        demo_budget:{
          max_runs:maxRuns,
          runs_used:runCount,
          runs_remaining:Math.max(0,maxRuns-runCount),
          cooldown_ms:cooldownMs,
        },
      });
      return;
    }

    if(req.method==="POST"&&url.pathname==="/api/demo"){
      if(!enabled(env)){
        send(res,503,{ok:false,error:"demo_disabled"});
        return;
      }
      if(!configured(env)){
        send(res,503,{ok:false,error:"nebius_not_configured"});
        return;
      }
      if(runCount>=maxRuns){
        send(res,429,{ok:false,error:"demo_budget_exhausted"});
        return;
      }
      if(busy){
        send(res,409,{ok:false,error:"demo_busy"});
        return;
      }
      const remainingCooldown=Math.max(0,cooldownMs-(now()-lastRunAt));
      if(lastRunAt&&remainingCooldown>0){
        send(res,429,{ok:false,error:"demo_cooldown",retry_after_ms:remainingCooldown},"application/json; charset=utf-8",{
          "retry-after":String(Math.max(1,Math.ceil(remainingCooldown/1000))),
        });
        return;
      }

      busy=true;
      runCount+=1;
      lastRunAt=now();
      try{
        const demo=await runDemoImpl(providerOptions(env));
        const verified=demo?.result?.state==="repaired_and_verified";
        send(res,verified?200:503,{
          ok:verified,
          demo,
          demo_budget:{
            runs_used:runCount,
            runs_remaining:Math.max(0,maxRuns-runCount),
          },
        });
      }catch(error){
        send(res,500,{
          ok:false,
          error:String(error?.message||"demo_failed").slice(0,300),
          demo_budget:{
            runs_used:runCount,
            runs_remaining:Math.max(0,maxRuns-runCount),
          },
        });
      }finally{
        busy=false;
      }
      return;
    }

    send(res,404,{ok:false,error:"not_found"});
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===__filename){
  const port=boundedInteger(process.env.PORT,8080,1,65535);
  const server=createRunbookZeroServer();
  server.listen(port,"0.0.0.0",()=>console.log("Runbook Zero listening on port "+port));
}
