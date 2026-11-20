#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ProviderCredentialVault } from '../../evercraft-home/credential-vault.mjs';
import { planHeartbeatAdvisories,executeAdvisory } from './heartbeat-advisory.mjs';
import { createRavenAdvisoryInvoker } from './raven-invoker.mjs';
import { reserveAdvisoryAttempt,loadAdvisoryHistory } from './advisory-ledger.mjs';

const asInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const safeText=v=>String(v||'').trim();
function privateJson(file){
 if(!path.isAbsolute(safeText(file)))throw Error('private_absolute_input_required');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('private_packet_permissions_invalid');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
export function availableAdvisers({credentialStateDir,settings={}}={}) {
 if(!credentialStateDir||!fs.existsSync(credentialStateDir))return [];
 const vault=new ProviderCredentialVault({stateDir:credentialStateDir});
 return ['anthropic','xai'].map(id=>{
  const x=settings[id]||{};
  const model=safeText(x.model);
  const estimated_cost_cents=asInt(x.estimated_cost_cents);
  return {id,model,estimated_cost_cents,
   ready:Boolean(model&&estimated_cost_cents>0&&vault.list({provider:id}).length)};
 });
}
export async function runAdvisoryHeartbeatOnce({
 missions=[],providers=[],ledgerDir,credentialStateDir='',rollingBudgetCents=0,
 execute=false,now=new Date().toISOString(),invokeOverride=null
}={}){
 if(!ledgerDir)throw Error('owned_advisory_ledger_required');
 const budget=asInt(rollingBudgetCents);
 const history=loadAdvisoryHistory({ledgerDir});
 const plan=planHeartbeatAdvisories({
  missions,providers,history,now,
  budget_cents_remaining:budget,max_calls:4
 });
 if(!execute)return {state:'dry_run',plan,results:[],provider_calls_performed:0};
 if(plan.queue.length===0)return {state:'quiet',plan,results:[],provider_calls_performed:0};
 if(budget===0) return {state:'held',plan,results:[],provider_calls_performed:0};
 const invoke=invokeOverride||createRavenAdvisoryInvoker({credentialStateDir});
 const results=[];
 for(const job of plan.queue){
  const result=await executeAdvisory(job,{
   invoke,
   recordAttempt:async()=>reserveAdvisoryAttempt({
    ledgerDir,job,rolling_budget_cents:budget,now_ms:Date.parse(now)
   })
  });
  results.push(result);
 }
 return {state:results.some(x=>x.state==='advisory_received')?'advisories_received':'held',
  plan,results,
  provider_calls_performed:results.filter(x=>x.attempt_consumed===true).length};
}
async function main(){
 const input=process.env.SYSTEMIA_ADVISORY_MISSION_PACKET_FILE;
 const ledgerDir=process.env.SYSTEMIA_ADVISORY_LEDGER_DIR;
 const credentialStateDir=process.env.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR;
 const packet=privateJson(input);
 if(packet?.schema!=='evercraft.systemia.private-mission-delta.v1'
    ||packet?.origin!=='systemia-admitted')
    throw Error('untrusted_mission_packet');
 const settings={
  anthropic:{model:process.env.SYSTEMIA_ADVISOR_ANTHROPIC_MODEL,
    estimated_cost_cents:process.env.SYSTEMIA_ADVISOR_ANTHROPIC_EST_COST_CENTS},
  xai:{model:process.env.SYSTEMIA_ADVISOR_XAI_MODEL,
    estimated_cost_cents:process.env.SYSTEMIA_ADVISOR_XAI_EST_COST_CENTS}
 };
 const providers=availableAdvisers({credentialStateDir,settings});
 const execute=process.env.SYSTEMIA_ADVISORY_EXECUTE==='1';
 const result=await runAdvisoryHeartbeatOnce({
  missions:packet.missions,providers,ledgerDir,credentialStateDir,
  rollingBudgetCents:process.env.SYSTEMIA_ADVISORY_ROLLING_BUDGET_CENTS||0,
  execute
 });
 // Never print mission details, private advice or source customer records.
 console.log(JSON.stringify({schema:'evercraft.systemia.advisory-runner-summary.v1',
  state:result.state,planned:result.plan.queue.length,
  held:result.plan.held.length,attempted:result.provider_calls_performed,
  received:result.results.filter(x=>x.state==='advisory_received').length,
  shadow:!execute,keys:result.results.map(x=>({key:x.key,state:x.state}))}));
}
const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url)main().catch(e=>{console.error('ADVISORY_RUNNER_HELD '+String(e?.message||e).slice(0,200));process.exitCode=1;});
