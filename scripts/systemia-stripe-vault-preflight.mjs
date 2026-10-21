#!/usr/bin/env node
/**
 * Read-only Raven Stripe credential-vault presence audit.
 *
 * Never creates/initializes a vault, decrypts records, or prints secrets,
 * credential references, filenames, full Stripe account IDs, or token contents.
 * File presence is NOT permission to call Stripe or evidence of payment.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RAVEN_NEXUS_DEFAULT_VAULT} from '../systemia/payments/raven-stripe-checkout-adapter.mjs';
import {displayStripeConnectionStatus} from '../systemia/payments/stripe-connection-registry.mjs';

const isPrivateOwner=(st,kind)=>{
  const uid=typeof process.getuid==='function'?process.getuid():null;
  return (kind==='directory'?st.isDirectory():st.isFile()) &&
    !st.isSymbolicLink() && (st.mode&0o077)===0 &&
    (uid===null||st.uid===uid);
};
const isMissing=err=>err?.code==='ENOENT';

export function inspectStripeVaultMetadata({stateDir}={}){
  const dir=stateDir||process.env.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||RAVEN_NEXUS_DEFAULT_VAULT;
  if(!path.isAbsolute(dir))return {vault_state:'held_invalid_absolute_path',sealed_live_stripe_records:0};
  const full=path.resolve(dir);
  let st;
  try{st=fs.lstatSync(full);}
  catch(err){
    if(isMissing(err))return {vault_state:'not_found_no_changes',sealed_live_stripe_records:0};
    return {vault_state:'unreadable_no_changes',sealed_live_stripe_records:0};
  }
  if(!isPrivateOwner(st,'directory')){
    return {vault_state:'held_insecure_directory',sealed_live_stripe_records:0};
  }
  const vaultKey=path.join(full,'.vault-key');
  let key;
  try{key=fs.lstatSync(vaultKey);}
  catch(err){
    return {vault_state:isMissing(err)?'uninitialized_no_changes':'held_key_inaccessible',
      sealed_live_stripe_records:0};
  }
  if(!isPrivateOwner(key,'file')||key.size!==32){
    return {vault_state:'held_invalid_vault_key_permissions_or_size',sealed_live_stripe_records:0};
  }
  let entries;
  try{entries=fs.readdirSync(full,{withFileTypes:true});}
  catch{return {vault_state:'held_directory_unreadable',sealed_live_stripe_records:0};}
  let count=0,unsafe=false,invalid=0;
  for(const entry of entries){
    if(!entry.name.endsWith('.json')||entry.name.startsWith('.'))continue;
    try{
      const file=path.join(full,entry.name);
      const stat=fs.lstatSync(file);
      if(!isPrivateOwner(stat,'file')||stat.size>102400){
        unsafe=true;continue;
      }
      const row=JSON.parse(fs.readFileSync(file,'utf8'));
      if(row?.schema!=='evercraft.provider-credential-envelope.v1'||row?.provider!=='stripe')continue;
      if(row.environment!=='live'||row.status!=='active')continue;
      const valid=/^provider_stripe_live_[a-f0-9]{16}$/.test(row.credential_ref||'') &&
        row.secret_material_stored===true &&
        row.plaintext_persisted===false &&
        row.encryption?.algorithm==='aes-256-gcm' &&
        typeof row.encryption?.ciphertext==='string' &&
        row.encryption.ciphertext.length>=8;
      if(valid)count++;
      else invalid++;
    }catch{invalid++;}
  }
  const vault_state=unsafe||invalid>0?'held_untrusted_vault_records':
    count>0?'sealed_live_stripe_metadata_found_not_authenticated':
    'existing_private_vault_no_stripe_record';
  return {vault_state,sealed_live_stripe_records:count,
    account_match_verified:false,stripe_api_authorized:false,
    live_checkout_verified:false,payment_verified:false,
    inspection_read_only:true};
}

export function stripeFieldPreflight({stateDir}={}){
  const account=displayStripeConnectionStatus();
  const vault=inspectStripeVaultMetadata({stateDir});
  return {
    schema:'evercraft.payments.raven-stripe-field-preflight.v1',
    identity_reference_stored:account.stored===true,
    identity_account_name:account.account_name||null,
    identity_live_mode:account.livemode===true,
    vault_state:vault.vault_state,
    sealed_live_stripe_records:vault.sealed_live_stripe_records,
    provider_account_match_verified:false,
    runtime_authorized:false,checkout_verified:false,
    payment_verified:false,fulfillment_verified:false,
    read_only:true,no_vault_created:true,
    next_gate:vault.sealed_live_stripe_records>0
      ? 'authorize_revalidate_existing_sealed_stripe_ref_through_raven_nexus'
      : 'authorize_stripe_secret_intake_into_existing_evercraft_vault',
  };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if(process.argv.length!==2){
    console.error('Usage: node scripts/systemia-stripe-vault-preflight.mjs');
    process.exitCode=2;
  }else{
    try{console.log(JSON.stringify(stripeFieldPreflight(),null,2));}
    catch(err){
      console.error('Stripe vault preflight held:',String(err?.message||'unavailable').slice(0,120));
      process.exitCode=1;
    }
  }
}
