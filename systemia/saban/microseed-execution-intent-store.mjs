/**
 * Durable, private reservation of a native MicroSeed execution attempt.
 *
 * Create BEFORE invoking a registered workload. A missing signed journal
 * plus an existing reservation means execution outcome is UNKNOWN and must
 * be reviewed; never auto-reexecute that idempotency key after restart.
 * Reservations contain only hashes and routing identifiers, never payloads,
 * authorization tokens, or keys. This is not a signed result or authority.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SHA=/^sha256:[a-f0-9]{64}$/;
function need(yes,reason){if(!yes)throw Error('microseed_execution_intent_'+reason);}
function hashName(value){
  need(typeof value==='string'&&value.length>0&&value.length<=240,'key_invalid');
  return createHash('sha256').update(value).digest('hex');
}

/**
 * No removal API by design. A signed receipt supersedes this reservation;
 * an unsigned or interrupted attempt requires a manual recovery decision.
 */
export async function reserveSignedMicroSeedExecution({
  stateDir,device_id,idempotency_key,request_hash,manifest_hash,workload_class,
}={}){
  need(typeof stateDir==='string'&&stateDir.trim().length>0,'state_dir_required');
  need(SHA.test(request_hash)&&SHA.test(manifest_hash),'digest_invalid');
  need(typeof workload_class==='string'&&workload_class.length>0&&
    workload_class.length<=240,'workload_invalid');

  const state=resolve(stateDir);
  // Verify each existing parent before creating a child. A symlinked
  // intermediate parent must not redirect even the initial mkdir.
  // Fresh native agents may not have a state directory until first work.
  // Create it with private permissions, then reject redirected roots.
  await mkdir(state,{recursive:true,mode:0o700});
  need(await realpath(state)===state,'unsafe_root');
  const parent=join(state,'signed-execution-intents');
  await mkdir(parent,{recursive:true,mode:0o700});
  need(await realpath(parent)===parent,'unsafe_root');
  const root=join(parent,'v1');
  await mkdir(root,{recursive:true,mode:0o700});
  need(await realpath(root)===root,'unsafe_root');
  const folder=join(root,hashName(device_id));
  await mkdir(folder,{recursive:true,mode:0o700});
  need(await realpath(folder)===folder,'unsafe_directory');
  const destination=join(folder,hashName(idempotency_key)+'.json');

  const intent={
    schema:'evercraft.microseed.signed-execution-intent.v1',
    device_id_hash:'sha256:'+hashName(device_id),
    idempotency_key_hash:'sha256:'+hashName(idempotency_key),
    request_hash,manifest_hash,workload_class,
    state:'execution_outcome_unknown_until_signed_journal',
  };
  let handle=null;
  try{
    // O_EXCL enforces one durable attempt per device+idempotency key,
    // even across independent agent processes using the same state volume.
    handle=await open(destination,'wx',0o600);
    await handle.writeFile(JSON.stringify(intent)+'\n');
    await handle.sync();
    await handle.close();
    handle=null;
    const directory=await open(folder,'r');
    try {await directory.sync();}
    finally {await directory.close();}
  }catch(error){
    if(error?.code==='EEXIST'){
      throw Error('microseed_execution_intent_unresolved');
    }
    throw Error('microseed_execution_intent_persistence_failed');
  }finally{
    if(handle)await handle.close().catch(()=>{});
    // Intentionally no unlink: a crash or failure must block reexecution.
  }
  return {reserved:true,state:'execution_outcome_unknown_until_signed_journal'};
}
