#!/usr/bin/env node
/**
 * Bounded read-only discovery of existing Evercraft encrypted provider-vault
 * locations. No recursive searches, no sudo, no secrets, credential refs,
 * raw environment or vault directory paths in the user-facing output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  inspectStripeVaultMetadata,
} from './systemia-stripe-vault-preflight.mjs';

function readPrivateEnvVaultLocation(file){
  try{
    const st=fs.lstatSync(file);
    const uid=typeof process.getuid==='function'?process.getuid():null;
    if(!st.isFile()||st.isSymbolicLink()||st.size>131072||
      (st.mode&0o077)!==0||(uid!==null&&st.uid!==uid))return null;
    const raw=fs.readFileSync(file,'utf8');
    const entries=raw.split(/\r?\n/).filter(line=>
      /^(RAVEN_PROVIDER_CREDENTIAL_STATE_DIR|EVERCRAFT_CREDENTIAL_STATE_DIR)=/.test(line)
    );
    for(const key of ['RAVEN_PROVIDER_CREDENTIAL_STATE_DIR','EVERCRAFT_CREDENTIAL_STATE_DIR']){
      const line=entries.find(entry=>entry.startsWith(key+'='));
      if(!line)continue;
      const value=line.slice(key.length+1).trim().replace(/^(['"])(.*)\1$/,'$2');
      if(path.isAbsolute(value)&&!value.includes('\0')&&value.length<=1024){
        return value;
      }
    }
  }catch{}
  return null;
}

export function boundedStripeVaultCandidates({
  home=os.homedir(),env=process.env,
  privateEnvFile=path.join(home,'.config','evercraft','local-organism.env'),
}={}){
  const entries=[
    ['raven_explicit_process_binding',env.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR],
    ['evercraft_explicit_process_binding',env.EVERCRAFT_CREDENTIAL_STATE_DIR],
    ['local_organism_private_configuration',readPrivateEnvVaultLocation(privateEnvFile)],
    ['raven_local_organism_default',path.join(home,'.local','state','evercraft','organism','compute','private','provider-credentials')],
    ['local_organism_identity',path.join(home,'.local','state','evercraft','organism','compute','identity','provider-credentials')],
    ['evercraft_home_system_vault','/var/lib/evercraft/home/credentials'],
    ['evercraft_identity_system_vault','/var/lib/evercraft/identity/provider-credentials'],
    ['evercraft_local_home_vault',path.join(home,'.local','state','evercraft','home','credentials')],
  ];
  const seen=new Set();
  return entries.filter(([label,dir])=>{
    if(!dir||!path.isAbsolute(dir)||dir.length>1024)return false;
    const canonical=path.normalize(dir);
    if(seen.has(canonical))return false;
    seen.add(canonical);return true;
  }).map(([label,dir])=>({label,dir}));
}

export function inspectBoundedStripeVaults({
  candidates=boundedStripeVaultCandidates(),
  inspector=inspectStripeVaultMetadata,
}={}){
  const results=candidates.map(({label,dir})=>{
    let state;
    try{state=inspector({stateDir:dir});}
    catch{state={vault_state:'held_inspection_error',sealed_live_stripe_records:0};}
    return {
      source:label,
      vault_state:String(state.vault_state||'held_unknown'),
      sealed_live_stripe_metadata_count:Number.isInteger(state.sealed_live_stripe_records)?
        Math.max(0,state.sealed_live_stripe_records):0,
      account_match_verified:false,stripe_api_authorized:false,
    };
  });
  const found=results.some(x=>x.sealed_live_stripe_metadata_count>0&&
    x.vault_state==='sealed_live_stripe_metadata_found_not_authenticated');
  const blocked=results.some(x=>x.vault_state.startsWith('held_') ||
    x.vault_state==='unreadable_no_changes');
  return {
    schema:'evercraft.payments.raven-stripe-bounded-vault-locator.v1',
    inspection:'bounded_read_only_metadata',
    candidates:results,
    any_sealed_stripe_record_found:found,
    some_locations_unreadable_or_held:blocked,
    candidate_scan_complete:!blocked,
    provider_account_match_verified:false,
    runtime_authorized:false,checkout_verified:false,payment_verified:false,
    credential_material_accessed:false,
    vault_or_account_modified:false,
    next_gate:found?'authorize_existing_vault_account_revalidation':
      blocked?'review_bound_or_inaccessible_vault_location_without_reconnect':
      'operator_authorize_credential_intake_only_if_needed',
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if(process.argv.length!==2){
    console.error('Usage: node scripts/systemia-stripe-vault-locator.mjs');
    process.exitCode=2;
  }else{
    console.log(JSON.stringify(inspectBoundedStripeVaults(),null,2));
  }
}
