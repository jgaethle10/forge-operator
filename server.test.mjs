import test from "node:test";
import assert from "node:assert/strict";
import { createRunbookZeroServer } from "./server.mjs";

async function withServer(options,fn){
  const server=createRunbookZeroServer(options);
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  const base="http://127.0.0.1:"+address.port;
  try{
    await fn(base);
  }finally{
    await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));
  }
}

test("public demo fails closed until explicitly enabled",async()=>{
  let calls=0;
  await withServer({
    env:{NEBIUS_TOKEN_FACTORY_KEY:"fixture-key",RUNBOOK_ZERO_DEMO_ENABLED:"0"},
    runDemoImpl:async()=>{calls+=1;return{result:{state:"repaired_and_verified"}};},
  },async(base)=>{
    const response=await fetch(base+"/api/demo",{method:"POST"});
    const body=await response.json();
    assert.equal(response.status,503);
    assert.equal(body.error,"demo_disabled");
    assert.equal(calls,0);
  });
});

test("enabled demo still fails closed without a Nebius credential",async()=>{
  let calls=0;
  await withServer({
    env:{RUNBOOK_ZERO_DEMO_ENABLED:"1"},
    runDemoImpl:async()=>{calls+=1;return{result:{state:"repaired_and_verified"}};},
  },async(base)=>{
    const response=await fetch(base+"/api/demo",{method:"POST"});
    const body=await response.json();
    assert.equal(response.status,503);
    assert.equal(body.error,"nebius_not_configured");
    assert.equal(calls,0);
  });
});

test("demo budget caps provider calls and does not expose the key",async()=>{
  let calls=0;
  const secret="nebius-secret-fixture-do-not-leak";
  await withServer({
    env:{
      RUNBOOK_ZERO_DEMO_ENABLED:"1",
      RUNBOOK_ZERO_DEMO_MAX_RUNS:"1",
      RUNBOOK_ZERO_DEMO_COOLDOWN_MS:"0",
      NEBIUS_TOKEN_FACTORY_KEY:secret,
    },
    runDemoImpl:async(options)=>{
      calls+=1;
      assert.equal(options.apiKey,secret);
      return{
        scenario:"fixture",
        before:"red",
        after:"green",
        result:{state:"repaired_and_verified",receipt_hash:"sha256:fixture"},
      };
    },
  },async(base)=>{
    const first=await fetch(base+"/api/demo",{method:"POST"});
    const firstBody=await first.json();
    assert.equal(first.status,200);
    assert.equal(firstBody.ok,true);
    assert.equal(firstBody.demo_budget.runs_remaining,0);

    const second=await fetch(base+"/api/demo",{method:"POST"});
    const secondBody=await second.json();
    assert.equal(second.status,429);
    assert.equal(secondBody.error,"demo_budget_exhausted");
    assert.equal(calls,1);

    const health=await fetch(base+"/health");
    const healthText=await health.text();
    const healthBody=JSON.parse(healthText);
    assert.equal(healthBody.nebius_configured,true);
    assert.equal(healthBody.demo_enabled,true);
    assert.equal(healthBody.demo_budget.max_runs,1);
    assert.equal(healthBody.demo_budget.runs_used,1);
    assert.equal(healthText.includes(secret),false);
  });
});

test("cooldown rejects rapid repeat calls before provider invocation",async()=>{
  let calls=0;
  let clock=10_000;
  await withServer({
    env:{
      RUNBOOK_ZERO_DEMO_ENABLED:"1",
      RUNBOOK_ZERO_DEMO_MAX_RUNS:"5",
      RUNBOOK_ZERO_DEMO_COOLDOWN_MS:"4000",
      NEBIUS_TOKEN_FACTORY_KEY:"fixture-key",
    },
    now:()=>clock,
    runDemoImpl:async()=>{
      calls+=1;
      return{result:{state:"repaired_and_verified"}};
    },
  },async(base)=>{
    const first=await fetch(base+"/api/demo",{method:"POST"});
    assert.equal(first.status,200);
    clock+=1000;
    const second=await fetch(base+"/api/demo",{method:"POST"});
    const secondBody=await second.json();
    assert.equal(second.status,429);
    assert.equal(secondBody.error,"demo_cooldown");
    assert.equal(calls,1);
    clock+=4000;
    const third=await fetch(base+"/api/demo",{method:"POST"});
    assert.equal(third.status,200);
    assert.equal(calls,2);
  });
});
