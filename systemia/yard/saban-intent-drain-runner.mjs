#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

export async function runYardSabanIntentDrain({
  yardStateDir,
  sabanStateDir,
  brokerDeploymentId,
  maxIntents=16,
  timeoutMs=10000,
  now=new Date(),
}={}){
  if(!yardStateDir)throw new Error('yard_state_dir_required');
  if(!sabanStateDir)throw new Error('saban_state_dir_required');
  if(!brokerDeploymentId)throw new Error('broker_deployment_id_required');
  const yard=new YardOperator({stateDir:path.resolve(yardStateDir)});
  const receipt=await yard.drainSabanNodeSeedIntents({
    sabanRoot:path.resolve(sabanStateDir),
    brokerDeploymentId,
    maxIntents,
    timeoutMs,
    now,
  });
  return {
    ...receipt,
    schema:'evercraft.yard.saban-intent-drain.v1',
    broker_deployment_id:brokerDeploymentId,
    authority_boundary:'yard_operator',
    allocator_authority_exposed_to_saban:false,
    commercial_spend_usd:0,
  };
}

async function main(){
  const receipt=await runYardSabanIntentDrain({
    yardStateDir:arg('--yard-state-dir',process.env.EVERCRAFT_YARD_STATE_DIR||''),
    sabanStateDir:arg('--saban-state-dir',process.env.SABAN_AMBIENT_STATE_DIR||''),
    brokerDeploymentId:arg('--broker-deployment-id',process.env.EVERCRAFT_REMOTE_BROKER_DEPLOYMENT_ID||''),
    maxIntents:Number(arg('--max-intents','16')),
    timeoutMs:Number(arg('--timeout-ms','10000')),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.yard.saban-intent-drain-error.v1',
      error:error instanceof Error?error.message:String(error),
      allocator_authority_exposed_to_saban:false,
      commercial_spend_usd:0,
    })+'\n');
    process.exitCode=1;
  });
}
