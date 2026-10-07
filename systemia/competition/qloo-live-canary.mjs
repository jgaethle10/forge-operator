import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { runCommonGroundAgent } from "./entries/qloo-commonground/agent.mjs";
import {
  qlooCompetitionSecretStatus,
  resolveQlooCompetitionSecret,
} from "./qloo-secret-boundary.mjs";

function arg(name,fallback=""){
  const index=process.argv.indexOf(name);
  return index>=0?String(process.argv[index+1]||""):fallback;
}
function hash(value){
  return "sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function write(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+"."+process.pid+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+"\n",{mode:0o600});
  fs.renameSync(tmp,file);
}

const out=path.resolve(arg(
  "--out",
  process.env.SYSTEMIA_QLOO_CANARY_RECEIPT||
  "artifacts/competition-provider/qloo-live-canary.json"
));
const secret=resolveQlooCompetitionSecret(process.env);
const secretStatus=qlooCompetitionSecretStatus(secret);

let receipt;
if(!secret){
  const body={
    schema:"evercraft.systemia.qloo-live-canary.v1",
    state:"held_missing_credentials",
    opportunity_id:"qloo-agentic-hackathon-2026",
    provider:"Qloo",
    credential_status:secretStatus,
    external_action_taken:false,
    payment_authority:false,
    terms_acceptance_attempted:false,
    observed_at:new Date().toISOString(),
  };
  receipt={...body,receipt_hash:hash(body)};
}else{
  try{
    const result=await runCommonGroundAgent({
      profiles:[
        {label:"canary-a",interests:["Studio Ghibli","Brian Eno"]},
        {label:"canary-b",interests:["Wes Anderson","Tyler, the Creator"]},
      ],
      objective:"Find common cultural ground",
      categories:["movie"],
      take:3,
    },{
      apiKey:secret.api_key,
      baseUrl:process.env.QLOO_API_BASE_URL||undefined,
    });
    const body={
      schema:"evercraft.systemia.qloo-live-canary.v1",
      state:"passed",
      opportunity_id:"qloo-agentic-hackathon-2026",
      provider:"Qloo",
      credential_status:secretStatus,
      provider_evidence_state:result.provider_evidence_state,
      recommendation_count:Number(result.results?.[0]?.recommendations?.length||0),
      plan:result.plan,
      agent_receipt_hash:result.receipt_hash,
      external_action_taken:false,
      payment_authority:false,
      terms_acceptance_attempted:false,
      observed_at:new Date().toISOString(),
    };
    receipt={...body,receipt_hash:hash(body)};
  }catch(error){
    const body={
      schema:"evercraft.systemia.qloo-live-canary.v1",
      state:"held_provider_error",
      opportunity_id:"qloo-agentic-hackathon-2026",
      provider:"Qloo",
      credential_status:secretStatus,
      error_code:String(error?.message||"qloo_canary_failed").slice(0,220),
      external_action_taken:false,
      payment_authority:false,
      terms_acceptance_attempted:false,
      observed_at:new Date().toISOString(),
    };
    receipt={...body,receipt_hash:hash(body)};
  }
}
write(out,receipt);
process.stdout.write(JSON.stringify(receipt)+"\n");
