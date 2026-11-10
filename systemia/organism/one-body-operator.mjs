#!/usr/bin/env node
/**
 * Private operator-only One-Body lifecycle. No network, no dispatch, no
 * payments, no automatic publishing, and no authority from inbound JSON.
 */
import { readFile, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { emptyBodyState, ingestBodyEvent, recordBodyLaneAcknowledgement } from './one-body.mjs';
import { createOneBodyStateFile, mutateOneBodyStateFile, readOneBodyStore } from './one-body-store.mjs';
import { buildOneBodyVisualSnapshot } from './one-body-visibility.mjs';
import { verifySignedBodyLaneReceipt } from './one-body-lane-signature.mjs';

async function jsonFile(filename,{privateOnly=false}={}) {
  const info=await lstat(filename);
  if(!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe_input_file');
  if(privateOnly && (info.mode & 0o077)!==0) throw new Error('trusted_registry_permissions_too_broad');
  return JSON.parse(await readFile(filename,'utf8'));
}
function verifier(keys) {
  if(!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('invalid_trusted_consumer_registry');
  return receipt=>verifySignedBodyLaneReceipt(receipt,{trustedConsumers:keys});
}
export async function runOneBodyCli(args) {
  const [command,file,input,trustFile]=args;
  if(!file) throw new Error('one_body_state_file_required');
  if(command==='init' && args.length===2) {
    const {receipt}=await createOneBodyStateFile(file,emptyBodyState());
    return {schema:'evercraft.one-body.operator-result.v1',operation:'init',revision:receipt.revision};
  }
  if(command==='ingest' && args.length===3) {
    const raw=await jsonFile(input);
    const {record,changed}=await mutateOneBodyStateFile(file,current=>ingestBodyEvent(current,raw).state);
    return {schema:'evercraft.one-body.operator-result.v1',operation:'ingest',revision:record.revision,
      persisted:changed,execution_authority_granted:false,delivery_verified:false};
  }
  if(command==='ack' && args.length===4) {
    const receipt=await jsonFile(input);
    const keys=await jsonFile(trustFile,{privateOnly:true});
    const {record,changed}=await mutateOneBodyStateFile(file,current=>{
      return recordBodyLaneAcknowledgement(current,receipt,{
        verifyReceipt:verifier(keys)
      }).state;
    });
    return {schema:'evercraft.one-body.operator-result.v1',operation:'ack',revision:record.revision,
      persisted:changed,consumer_acknowledgement_recorded:changed,
      execution_authority_granted:false,delivery_verified:false};
  }
  if(command==='export' && (args.length===2 || args.length===3)) {
    const record=await readOneBodyStore(file);
    const verifyReceipt=input ? verifier(await jsonFile(input,{privateOnly:true})) : null;
    return buildOneBodyVisualSnapshot({state:record.state,verifyReceipt});
  }
  throw new Error('usage: init <state> | ingest <state> <event.json> | ack <state> <receipt.json> <operator-keys.json> | export <state> [operator-keys.json]');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const data=await runOneBodyCli(process.argv.slice(2));
    process.stdout.write(JSON.stringify(data,null,2)+'\n');
  } catch(e) {
    // Avoid echoing private values or filenames from low-level parser errors.
    const allowed=/^(one_body_|invalid_|unsafe_|trusted_registry_|unknown_body_|lane_|stale_)/;
    console.error(allowed.test(String(e.message))?e.message:'one_body_operator_operation_failed');
    process.exitCode=1;
  }
}
