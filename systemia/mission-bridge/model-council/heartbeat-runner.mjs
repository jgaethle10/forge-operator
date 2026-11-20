#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHmac,timingSafeEqual} from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ProviderCredentialVault } from '../../evercraft-home/credential-vault.mjs';
import { planHeartbeatAdvisories,executeAdvisory } from './heartbeat-advisory.mjs';
import { createRavenAdvisoryInvoker } from './raven-invoker.mjs';
import { reserveAdvisoryAttempt,loadAdvisoryHistory } from './advisory-ledger.mjs';

const asInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
function arg(name,fallback=''){
 const i=process.argv.indexOf(name);
 return i>=0&&process.argv[i+1]?String(process.argv[i+1]):fallback;
}
function packetAuth(packet,{secretFile='',nowMs=Date.now(),requireSignature=false}={}){
 if(packet?.schema!=='evercraft.systemia.private-mission-delta.v1'||
    packet?.origin!=='systemia-admitted'||!Array.isArray(packet.missions)){
   throw Error('untrusted_mission_packet');
 }
 if(!requireSignature)return true;
 if(!secretFile)throw Error('admission_signature_key_missing');
 const keyPath=path.resolve(secretFile);
 if(!path.isAbsolute(secretFile))throw Error('admission_signature_key_not_absolute');
 const stat=fs.lstatSync(keyPath);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('admission_key_permissions_invalid');
 const key=fs.readFileSync(keyPath);
 if(key.length<32)throw Error('admission_signature_key_too_short');
 const issued=Date.parse(packet.issued_at),expires=Date.parse(packet.expires_at);
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>nowMs||expires<=nowMs||
    expires-issued>600000||nowMs-issued>600000)throw Error('admission_packet_expired_or_invalid');
 if(!/^[a-f0-9]{64}$/.test(packet.admission_signature||''))throw Error('admission_signature_invalid');
 const {admission_signature,...unsigned}=packet;
 const expected=createHmac('sha256',key).update(JSON.stringify(unsigned)).digest('hex');
 const a=Buffer.from(expected,'hex'),b=Buffer.from(admission_signature,'hex');
 if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('admission_signature_mismatch');
 return true;
}
export {packetAuth};
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
 const input=arg('--packet-file',process.env.SYSTEMIA_ADVISORY_MISSION_PACKET_FILE||'');
 const ledgerDir=arg('--ledger-dir',process.env.SYSTEMIA_ADVISORY_LEDGER_DIR||'');
 const credentialStateDir=arg('--credential-state-dir',process.env.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||'');
 const execute=arg('--execute',process.env.SYSTEMIA_ADVISORY_EXECUTE||'0')==='1';
 const packet=privateJson(input);
 packetAuth(packet,{requireSignature:execute,
   secretFile:arg('--admission-key-file',process.env.SYSTEMIA_ADVISORY_ADMISSION_KEY_FILE||'')});
 const settings={
  anthropic:{model:process.env.SYSTEMIA_ADVISOR_ANTHROPIC_MODEL,
    estimated_cost_cents:process.env.SYSTEMIA_ADVISOR_ANTHROPIC_EST_COST_CENTS},
  xai:{model:process.env.SYSTEMIA_ADVISOR_XAI_MODEL,
    estimated_cost_cents:process.env.SYSTEMIA_ADVISOR_XAI_EST_COST_CENTS}
 };
 const providers=availableAdvisers({credentialStateDir,settings});
 const result=await runAdvisoryHeartbeatOnce({
  missions:packet.missions,providers,ledgerDir,credentialStateDir,
  rollingBudgetCents:arg('--rolling-budget-cents',process.env.SYSTEMIA_ADVISORY_ROLLING_BUDGET_CENTS||'0'),
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
