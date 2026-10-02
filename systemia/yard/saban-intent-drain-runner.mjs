#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';
import {writeSafeNodeSeedInventory} from '../saban/nodeseed-inventory-ingest.mjs';

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
  const yardRoot=path.resolve(yardStateDir);
  const sabanRoot=path.resolve(sabanStateDir);
  const yard=new YardOperator({stateDir:yardRoot});

  const remoteInventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const safeInventory=writeSafeNodeSeedInventory({
    inventory:remoteInventory,
    file:path.join(sabanRoot,'nodeseed-capacity-inventory.json'),
  });

  const drained=await yard.drainSabanNodeSeedIntents({
    sabanRoot,
    brokerDeploymentId,
    maxIntents,
    timeoutMs,
    now,
  });
  const receipt={
    ...drained,
    schema:'evercraft.yard.saban-intent-drain.v1',
    broker_deployment_id:brokerDeploymentId,
    refreshed_safe_inventory_count:safeInventory.count,
    safe_inventory_receipt_hash:safeInventory.receipt_hash,
    authority_boundary:'yard_operator',
    allocator_authority_exposed_to_saban:false,
    control_authority_exposed_to_saban:false,
    commercial_spend_usd:0,
  };
  fs.mkdirSync(sabanRoot,{recursive:true,mode:0o700});
  const tmp=path.join(sabanRoot,'yard-saban-intent-drain.json.tmp');
  fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,path.join(sabanRoot,'yard-saban-intent-drain.json'));
  return receipt;
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
