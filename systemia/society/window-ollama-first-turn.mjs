/**
 * Mossmere: ONE manually approved local Ollama decision via existing Raven.
 * Defaults to preflight-only. No new model provider, Base44, public state write,
 * paid API, unattended scheduler, or externally accessible inference endpoint.
 *
 * Usage:
 *   node systemia/society/window-ollama-first-turn.mjs --model MODEL
 *   node systemia/society/window-ollama-first-turn.mjs --model MODEL \
 *      --state-dir /absolute/private/path --approve-one-local-turn
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createInferenceEngine} from '../raven/inference-gateway.mjs';
import {createWorld} from '../../public/the-window/world.mjs';
import {createRavenLocalAgentClient} from './window-raven-ollama-client.mjs';
import {initializeLocalSociety,readLocalSociety,runLocalSocietyTurn,readLocalObserver}
  from './window-local-journal.mjs';

export const PROOF_SCHEMA='evercraft.window.ollama-first-turn.v1';
const BUDGET_FILE='one-local-model-budget.json';
const ID='r1';
function validName(s){return typeof s==='string'&&/^[a-zA-Z0-9_.:-]{2,90}$/.test(s);}
function absoluteDir(d){if(typeof d!=='string'||!path.isAbsolute(d))throw Error('Absolute private state directory required');}
async function writeExclusive(file,data){
  const h=await fs.open(file,'wx',0o600);
  try{await h.writeFile(JSON.stringify(data)+'\n','utf8');await h.sync();}
  finally{await h.close();}
}
async function writeRecon(file,record){
  // Reserve file remains the authority: write a new version with atomic rename.
  const source=JSON.parse(await fs.readFile(file,'utf8'));
  if(source.schema!==PROOF_SCHEMA||source.state!=='reserved'||
    source.reservation_id!==record.reservation_id)
    throw Error('Invalid local budget reservation for reconciliation');
  const accepted=['provider_response_valid','held_error'];
  if(!accepted.includes(record.status))throw Error('Unrecognized budget outcome');
  const next={...source,state:record.status,provider_request_id:record.provider_request_id,
    reported_cost_micro_usd:record.reported_cost_micro_usd,
    world_decision_hash:record.world_decision_hash||null,
    error_class:record.error_class||null};
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
    await writeExclusive(temp,next);
    await fs.rename(temp,file);
    const d=await fs.open(path.dirname(file),'r');
    try{await d.sync();}finally{await d.close();}
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
export function zeroExternalFeeGate({dir,provider,model,now=Date.now()}){
  absoluteDir(dir);
  if(provider!=='ollama'||!validName(model))throw Error('Local Ollama only');
  const file=path.join(dir,BUDGET_FILE);
  return {
    async reserve(request){
      if(request?.society!=='mossmere'||request.provider!=='ollama'||
        request.model!==model||request.agent_id!==ID||
        typeof request.observation_hash!=='string'||request.observation_hash.length!==64||
        typeof request.request_key!=='string'||request.request_key.length!==64||
        !Number.isSafeInteger(request.world_tick)||
        !Number.isSafeInteger(now))throw Error('Invalid local-only budget request');
      const reservation_id='ollama_'+randomUUID();
      const record={schema:PROOF_SCHEMA,state:'reserved',reservation_id,
        world_tick:request.world_tick,agent_id:ID,
        observation_hash:request.observation_hash,request_key:request.request_key,
        provider:'ollama',model,max_cost_micro_usd:0,max_tokens:300,
        created_at:new Date(now).toISOString()};
      // One-and-only-one reservation per state directory. A crash stays
      // reserved rather than re-invoking an expensive or ambiguous request.
      await writeExclusive(file,record);
      return {...request,approved:true,reservation_id,
        expires_at:now+120000,max_tokens:300,max_cost_micro_usd:0};
    },
    async reconcile(record){return writeRecon(file,record);}
  };
}
export async function inspectLocalOllama({model,engine}){
  if(!validName(model))throw Error('Specify an explicit installed Ollama model');
  const instance=engine||createInferenceEngine({provider:'ollama',model});
  if(instance.provider!=='ollama'||instance.model!==model)
    throw Error('Refusing non-Ollama provider or mismatched model');
  const result=await instance.validate();
  if(result.status!=='available'||result.provider!=='ollama'||result.model!==model||
    result.inference_performed!==false||result.prompt_sent!==false)
    throw Error('Unverified local model inventory');
  return {provider:'ollama',model,available:true,inference_performed:false};
}
export async function runFirstLocalOllamaTurn({
  model,stateDir,approve=false,engine,now=Date.now()
}){
  const preflight=await inspectLocalOllama({model,engine});
  if(!approve)return {schema:PROOF_SCHEMA,status:'preflight_only',
    ...preflight,paid_api_calls:0,world_mutated:false};
  absoluteDir(stateDir);
  const local=engine||createInferenceEngine({provider:'ollama',model});
  await fs.mkdir(stateDir,{recursive:true,mode:0o700});
  try{await readLocalSociety({dir:stateDir});}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    // A fresh private lab, deliberately not the canonical Mossmere snapshot.
    await initializeLocalSociety({dir:stateDir,world:createWorld(now,818),now});
  }
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const client=createRavenLocalAgentClient({engine:local});
  const result=await runLocalSocietyTurn({
    dir:stateDir,agentId:ID,provider:'ollama',model,
    providerClient:client,
    budgetGate:zeroExternalFeeGate({dir:stateDir,provider:'ollama',model,now}),
    adapterSigningKey:privateKey.export({type:'pkcs8',format:'pem'}),
    trustedAdapterPublicKey:publicKey.export({type:'spki',format:'pem'}),
    now
  });
  const observer=await readLocalObserver({dir:stateDir});
  return {schema:PROOF_SCHEMA,status:'held_real_model_candidate',
    evidence:'local_raven_model_adapter_not_independently_verified',
    source:'raven_ollama',model,sequence:result.sequence,
    release_status:result.release_status,
    decision:observer.decisions.at(-1)||null,
    paid_api_calls:0,public_world_mutated:false};
}
function args(argv){
  const out={approve:false,model:'',stateDir:''};
  for(let i=0;i<argv.length;i++){
    const s=argv[i];
    if(s==='--model')out.model=argv[++i]||'';
    else if(s==='--state-dir')out.stateDir=argv[++i]||'';
    else if(s==='--approve-one-local-turn')out.approve=true;
    else throw Error('Unknown option '+s);
  }
  return out;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  runFirstLocalOllamaTurn(args(process.argv.slice(2)))
    .then(x=>process.stdout.write(JSON.stringify(x,null,2)+'\n'))
    .catch(e=>{process.stderr.write('MOSSMERE_HELD '+e.message+'\n');process.exitCode=1;});
}
