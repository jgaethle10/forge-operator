import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export const DEFAULT_NEBIUS_BASE_URL="https://api.tokenfactory.nebius.com/v1";
export const DEFAULT_NEBIUS_MODEL="nvidia/nemotron-3-super-120b-a12b";

function clean(value,max=8000){ return String(value??"").trim().slice(0,max); }
function sha(value){ return "sha256:"+createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex"); }
function safeRelative(value){
  const raw=String(value??"").replace(/\\/g,"/").trim();
  if(!raw||raw.startsWith("/")||raw.includes("../")||raw==="..") throw new Error("unsafe_relative_path");
  return raw;
}
function resolveAllowed(root,relative){
  const rel=safeRelative(relative), file=path.resolve(root,rel), base=path.resolve(root)+path.sep;
  if(file!==path.resolve(root)&&!file.startsWith(base)) throw new Error("path_escape_blocked");
  return {file,rel};
}

export function normalizeRepairMission(input={}){
  const root=path.resolve(String(input.repository_path||input.repositoryPath||"."));
  const allowed=[...new Set((input.allowed_files||input.allowedFiles||[]).map(safeRelative))].slice(0,12);
  if(!allowed.length) throw new Error("allowed_files_required");
  const verify=Array.isArray(input.verify_command||input.verifyCommand)
    ? (input.verify_command||input.verifyCommand).map((x)=>clean(x,500)).filter(Boolean) : [];
  if(!verify.length) throw new Error("verify_command_argv_required");
  if(verify.length>16) throw new Error("verify_command_too_long");
  return {
    repository_path:root,
    allowed_files:allowed,
    verify_command:verify,
    max_rounds:Math.max(1,Math.min(4,Number(input.max_rounds||input.maxRounds||3))),
    objective:clean(input.objective||"Make the verification command pass with the smallest safe repair.",1200),
  };
}

export async function runVerification(mission,{timeoutMs=30_000}={}){
  const [command,...args]=mission.verify_command;
  const started=Date.now();
  return await new Promise((resolve)=>{
    const childEnv={...process.env,CI:"1"};
    delete childEnv.NODE_TEST_CONTEXT;
    delete childEnv.NODE_TEST_REPORTER;
    delete childEnv.NODE_TEST_REPORTER_DESTINATION;
    const child=spawn(command,args,{cwd:mission.repository_path,shell:false,env:childEnv,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="",settled=false;
    const finish=(result)=>{
      if(settled) return; settled=true; clearTimeout(timer);
      resolve({...result,stdout:clean(stdout,12_000),stderr:clean(stderr,12_000),duration_ms:Date.now()-started});
    };
    child.stdout.on("data",(chunk)=>{stdout+=chunk.toString("utf8");});
    child.stderr.on("data",(chunk)=>{stderr+=chunk.toString("utf8");});
    child.on("error",(error)=>finish({ok:false,exit_code:null,error:clean(error.message,500)}));
    child.on("close",(code,signal)=>finish({ok:code===0,exit_code:code,signal:signal||null,error:null}));
    const timer=setTimeout(()=>{ child.kill("SIGKILL"); finish({ok:false,exit_code:null,signal:"SIGKILL",error:"verification_timeout"}); },Math.max(1000,Number(timeoutMs||30_000)));
  });
}

export function readRepairContext(mission){
  return mission.allowed_files.map((relative)=>{
    const {file,rel}=resolveAllowed(mission.repository_path,relative);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()) throw new Error("allowed_file_missing:"+rel);
    const content=fs.readFileSync(file,"utf8");
    if(Buffer.byteLength(content,"utf8")>80_000) throw new Error("allowed_file_too_large:"+rel);
    return {file:rel,content};
  });
}
function extractJson(text){
  let value=String(text||"").trim().replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  const fence=value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) value=fence[1].trim();
  const first=value.indexOf("{"),last=value.lastIndexOf("}");
  if(first>=0&&last>first) value=value.slice(first,last+1);
  return JSON.parse(value);
}
export function normalizeRepairPlan(input={},mission){
  if(!input||typeof input!=="object"||Array.isArray(input)) throw new Error("repair_plan_object_required");
  const allowed=new Set(mission.allowed_files);
  const edits=(Array.isArray(input.edits)?input.edits:[]).slice(0,8).map((edit)=>{
    const file=safeRelative(edit.file);
    if(!allowed.has(file)) throw new Error("repair_plan_file_not_allowed:"+file);
    const search=String(edit.search??""), replacement=String(edit.replace??edit.replacement??"");
    if(!search) throw new Error("repair_plan_search_required");
    if(search.length>20_000||replacement.length>30_000) throw new Error("repair_plan_edit_too_large");
    return {file,search,replacement};
  });
  return {diagnosis:clean(input.diagnosis,1600),done:input.done===true,edits};
}

export async function requestNemotronRepair({mission,verification,files,round},{
  fetchImpl=globalThis.fetch,
  apiKey=process.env.NEBIUS_TOKEN_FACTORY_KEY||process.env.NEBIUS_API_KEY||"",
  baseUrl=process.env.NEBIUS_TOKEN_FACTORY_BASE_URL||DEFAULT_NEBIUS_BASE_URL,
  model=process.env.NEBIUS_MODEL||DEFAULT_NEBIUS_MODEL,
  timeoutMs=30_000,
}={}){
  if(typeof fetchImpl!=="function") throw new Error("fetch_required");
  if(!clean(apiKey,2000)) throw new Error("nebius_api_key_missing");
  const system=[
    "You are Runbook Zero, a bounded repository repair agent.",
    "Return exactly one JSON object and no commentary.",
    "You may only propose exact text replacements in the allowed files shown.",
    "Never propose shell commands, new dependencies, secrets, network calls, destructive actions, or files outside the allowlist.",
    "Prefer the smallest edit that fixes the observed verification failure.",
    'Schema: {"diagnosis":"string","done":false,"edits":[{"file":"relative/path","search":"exact existing text","replace":"replacement text"}]}',
    "If no safe repair is justified, return done=true with edits=[] and explain why in diagnosis.",
  ].join("\n");
  const user=JSON.stringify({objective:mission.objective,round,allowed_files:mission.allowed_files,verify_command:mission.verify_command,verification,files});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||30_000)));
  try{
    const response=await fetchImpl(String(baseUrl).replace(/\/$/,"")+"/chat/completions",{
      method:"POST",
      headers:{authorization:"Bearer "+apiKey,"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({model,temperature:0.1,max_tokens:1800,messages:[{role:"system",content:system},{role:"user",content:user}]}),
      signal:controller.signal,
    });
    const raw=await response.text(); let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{payload={};}
    if(!response.ok) throw new Error("nebius_http_"+response.status+":"+clean(payload?.detail||payload?.error?.message||raw,300));
    const content=payload?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim()) throw new Error("nebius_empty_response");
    return {plan:normalizeRepairPlan(extractJson(content),mission),provider:{platform:"Nebius Token Factory",model:String(payload?.model||model),response_id:clean(payload?.id,220)||null}};
  }finally{ clearTimeout(timer); }
}
function snapshotFiles(mission){
  const out=new Map();
  for(const relative of mission.allowed_files){ const {file,rel}=resolveAllowed(mission.repository_path,relative); out.set(rel,fs.readFileSync(file,"utf8")); }
  return out;
}
function restoreFiles(mission,snapshot){ for(const [relative,content] of snapshot){ const {file}=resolveAllowed(mission.repository_path,relative); fs.writeFileSync(file,content,"utf8"); } }
export function applyRepairPlan(mission,plan){
  const receipts=[];
  for(const edit of plan.edits){
    const {file,rel}=resolveAllowed(mission.repository_path,edit.file);
    const before=fs.readFileSync(file,"utf8"), first=before.indexOf(edit.search);
    if(first<0) throw new Error("repair_search_not_found:"+rel);
    if(before.indexOf(edit.search,first+edit.search.length)>=0) throw new Error("repair_search_not_unique:"+rel);
    const after=before.slice(0,first)+edit.replacement+before.slice(first+edit.search.length);
    fs.writeFileSync(file,after,"utf8");
    receipts.push({file:rel,before_hash:sha(before),after_hash:sha(after),bytes_before:Buffer.byteLength(before),bytes_after:Buffer.byteLength(after)});
  }
  return receipts;
}

export async function repairRepository(input={},options={}){
  const mission=normalizeRepairMission(input), snapshot=snapshotFiles(mission), startedAt=new Date().toISOString();
  const initial=await runVerification(mission,options);
  if(initial.ok){
    const body={schema:"evercraft.competition.nebius-runbook-zero.v1",state:"already_green",provider:"Nebius Token Factory",model:null,rounds:[],initial_verification:initial,final_verification:initial,files_changed:[],rollback_performed:false,external_action_authority:false,command_authority:"mission_allowlist_only",started_at:startedAt,completed_at:new Date().toISOString()};
    return {...body,receipt_hash:sha(body)};
  }
  const rounds=[]; let verification=initial,providerModel=null;
  try{
    for(let round=1;round<=mission.max_rounds;round++){
      const proposed=await requestNemotronRepair({mission,verification,files:readRepairContext(mission),round},options);
      providerModel=proposed.provider.model;
      if(proposed.plan.done&&proposed.plan.edits.length===0){ rounds.push({round,diagnosis:proposed.plan.diagnosis,state:"model_held",edit_receipts:[],verification}); break; }
      if(!proposed.plan.edits.length) throw new Error("repair_plan_has_no_edits");
      const editReceipts=applyRepairPlan(mission,proposed.plan);
      verification=await runVerification(mission,options);
      rounds.push({round,diagnosis:proposed.plan.diagnosis,state:verification.ok?"verified":"verification_failed",edit_receipts:editReceipts,verification});
      if(verification.ok){
        const body={schema:"evercraft.competition.nebius-runbook-zero.v1",state:"repaired_and_verified",provider:"Nebius Token Factory",model:providerModel,rounds,initial_verification:initial,final_verification:verification,files_changed:[...new Set(rounds.flatMap((r)=>r.edit_receipts.map((e)=>e.file)))],rollback_performed:false,external_action_authority:false,command_authority:"mission_allowlist_only",started_at:startedAt,completed_at:new Date().toISOString()};
        return {...body,receipt_hash:sha(body)};
      }
    }
    restoreFiles(mission,snapshot);
    const body={schema:"evercraft.competition.nebius-runbook-zero.v1",state:"held_not_verified",provider:"Nebius Token Factory",model:providerModel,rounds,initial_verification:initial,final_verification:verification,files_changed:[],rollback_performed:true,external_action_authority:false,command_authority:"mission_allowlist_only",started_at:startedAt,completed_at:new Date().toISOString()};
    return {...body,receipt_hash:sha(body)};
  }catch(error){
    restoreFiles(mission,snapshot);
    const body={schema:"evercraft.competition.nebius-runbook-zero.v1",state:"held_error",provider:"Nebius Token Factory",model:providerModel,rounds,initial_verification:initial,final_verification:verification,error_code:clean(error?.message||"repair_failed",300),files_changed:[],rollback_performed:true,external_action_authority:false,command_authority:"mission_allowlist_only",started_at:startedAt,completed_at:new Date().toISOString()};
    return {...body,receipt_hash:sha(body)};
  }
}
