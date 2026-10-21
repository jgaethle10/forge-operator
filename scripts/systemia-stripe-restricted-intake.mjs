#!/usr/bin/env node
/**
 * Explicit operator-only one-time Stripe restricted key intake.
 * Consumes a hidden terminal-input pipe. Reuses an already initialized,
 * owner-only Evercraft encrypted provider vault. No public API or MCP action.
 * Authenticates account and two prices via read-only Stripe calls BEFORE seal.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ProviderCredentialVault} from '../systemia/evercraft-home/credential-vault.mjs';
import {readStripeConnectionReference} from '../systemia/payments/stripe-connection-registry.mjs';
import {STRIPE_FIXED_PRICE_BINDINGS,inspectStripeFixedPriceBinding} from '../systemia/payments/raven-stripe-price-bridge.mjs';

const PROVIDER='stripe';
const ENVIRONMENT='live';
const LABEL='evercraft-payments';
const RAK_FORMAT=new RegExp('^rk_'+'live_[A-Za-z0-9]{16,200}$');
const DEFAULT_EXISTING_VAULT='/var/lib/evercraft/home/credentials';
const API_ORIGIN='https://api.stripe.com';

function existingPrivateVault(stateDir){
  if(!stateDir||!path.isAbsolute(stateDir))throw Error('existing_private_vault_absolute_path_required');
  const full=path.resolve(stateDir);
  const keyFile=path.join(full,'.vault-key');
  const uid=typeof process.getuid==='function'?process.getuid():null;
  for(const [name,kind] of [[full,'directory'],[keyFile,'file']]){
    let st;
    try{st=fs.lstatSync(name)}
    catch{throw Error('existing_evercraft_vault_or_key_missing')}
    if(st.isSymbolicLink()||(st.mode&0o077)!==0||
       (uid!==null&&st.uid!==uid)||
       (kind==='directory'?!st.isDirectory():!st.isFile())||
       (kind==='file'&&st.size!==32)){
      throw Error('evercraft_vault_permissions_or_identity_unsafe');
    }
  }
  return full;
}
function findLiveStripeMetadata(stateDir){
  const vault=new ProviderCredentialVault({stateDir});
  return vault.list({provider:PROVIDER}).filter(row=>
    row.provider===PROVIDER && row.environment===ENVIRONMENT &&
    row.status==='active'
  );
}
async function stripeReadOnly({key,url,fetchImpl=fetch}){
  let res;
  try{
    res=await fetchImpl(url,{
      method:'GET',headers:{authorization:'Bearer '+key,accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(12000),
    });
  }catch{throw Error('stripe_read_only_auth_check_unreachable')}
  if(!res.ok)throw Error('stripe_read_only_auth_http_'+res.status);
  if(!String(res.headers?.get('content-type')||'').toLowerCase().includes('application/json')){
    throw Error('stripe_read_only_auth_non_json');
  }
  try{return await res.json()}
  catch{throw Error('stripe_read_only_auth_invalid_json')}
}

/** No provider writes. Never print or return the key. */
export async function verifyStripeRestrictedKeyForEvercraft({
  key,account,fetchImpl=fetch,
}={}){
  if(!RAK_FORMAT.test(String(key||'')))throw Error('stripe_live_restricted_key_required');
  if(!account||account.schema!=='systemia.payments.stripe-connection-reference.v1'||
    account.livemode!==true||account.provider_boundary!=='raven_nexus'||
    !/^acct_[A-Za-z0-9]{10,64}$/.test(String(account.stripe_context||''))){
    throw Error('stored_evercraft_account_identity_required');
  }
  const identity=await stripeReadOnly({key,url:API_ORIGIN+'/v1/account',fetchImpl});
  if(identity?.object!=='account'||identity.id!==account.stripe_context){
    throw Error('stripe_key_does_not_match_saved_evercraft_account');
  }
  if(identity.charges_enabled!==true)throw Error('stripe_account_not_charge_enabled');
  for(const [slug,binding] of Object.entries(STRIPE_FIXED_PRICE_BINDINGS)){
    const observed=await stripeReadOnly({
      key,url:API_ORIGIN+'/v1/prices/'+binding.stripe_price,fetchImpl
    });
    if(!inspectStripeFixedPriceBinding(slug,observed).ok){
      throw Error('stripe_restricted_key_offer_price_mismatch');
    }
  }
  return {
    account_match_verified:true,charges_enabled_verified:true,
    fixed_price_read_checks:Object.keys(STRIPE_FIXED_PRICE_BINDINGS).length,
    checkout_write_permission_verified:false,checkout_session_created:false,
    payment_verified:false,
  };
}

export async function verifyAndSealStripeRestrictedKey({
  key,stateDir=DEFAULT_EXISTING_VAULT,
  account=readStripeConnectionReference(),fetchImpl=fetch,
}={}){
  const dir=existingPrivateVault(stateDir);
  if(findLiveStripeMetadata(dir).length!==0){
    throw Error('existing_stripe_credential_present_do_not_replace');
  }
  const checks=await verifyStripeRestrictedKeyForEvercraft({key,account,fetchImpl});
  // Re-check existing entries after potentially slow network calls.
  if(findLiveStripeMetadata(dir).length!==0){
    throw Error('stripe_credential_added_during_verification_stop');
  }
  const vault=new ProviderCredentialVault({stateDir:dir});
  const receipt=vault.put({
    provider:PROVIDER,environment:ENVIRONMENT,label:LABEL,
    apiKeyId:'stripe-restricted-live-key',
    apiSecret:key,actorRef:'penguin:operator-confirmed-intake',
  });
  return {
    schema:'evercraft.payments.stripe-restricted-key-intake.v1',
    state:'encrypted_credential_sealed',
    provider:'stripe',account_name:account.account_name,
    credential_sealed:true,
    secret_material_returned:false,plaintext_persisted:false,
    ...checks,
    raven_runtime_bound:false,
    full_checkout_ready:false,
  };
}
async function readPipedSecret(stdin=process.stdin){
  if(stdin.isTTY)throw Error('hidden_input_pipe_required_no_visible_prompt');
  let chunks=[],size=0;
  for await(const chunk of stdin){
    size+=chunk.length;
    if(size>512)throw Error('stripe_input_too_large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(args){
  const [command,...extra]=args;
  if(command==='status'&&extra.length===0){
    const dir=existingPrivateVault(DEFAULT_EXISTING_VAULT);
    const count=findLiveStripeMetadata(dir).length;
    console.log(JSON.stringify({
      vault_present:true,existing_live_stripe_credential_count:count,
      account_identity_stored:readStripeConnectionReference()!==null,
      provider_account_match_verified:false,
      runtime_authorized:false,checkout_verified:false,payment_verified:false,
      secret_material_returned:false,
    },null,2));
    return;
  }
  if(command==='seal'&&extra.length===1&&extra[0]==='--confirm-restricted-key-intake'){
    const key=await readPipedSecret();
    const result=await verifyAndSealStripeRestrictedKey({key});
    console.log(JSON.stringify(result,null,2));
    return;
  }
  throw Error('usage: status OR seal --confirm-restricted-key-intake (key via hidden stdin)');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(err=>{
    // Intentionally never log rejected key, response body or credential ref.
    console.error('Stripe key intake held:',String(err?.message||'unavailable').slice(0,120));
    process.exitCode=1;
  });
}
