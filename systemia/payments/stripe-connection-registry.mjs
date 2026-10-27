/**
 * Private, durable reference to the Stripe account observed via a user-authorized
 * provider connector. This does NOT copy OAuth tokens, API keys or runtime
 * payment authority into Penguin. Raven Nexus remains credential custodian.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STRIPE_CONNECTION_SCHEMA='systemia.payments.stripe-connection-reference.v1';
export const STRIPE_CONNECTION_KEY='evercraft-primary-stripe';

export function stripeConnectionPath({
  stateHome=process.env.XDG_STATE_HOME || path.join(os.homedir(),'.local','state'),
}={}){
  if(!path.isAbsolute(stateHome))throw Error('state_home_must_be_absolute');
  return path.join(stateHome,'evercraft','systemia','payments','provider-connections','stripe.json');
}

const safeName=value=>{
  const name=String(value||'').trim();
  if(!name||name.length>120||/[\x00-\x1f\x7f]/.test(name))throw Error('stripe_account_name_invalid');
  return name;
};

export function buildStripeConnectionReference({
  stripeContext,accountName,livemode,observedDate,
}={}){
  if(!/^acct_[A-Za-z0-9]{10,64}$/.test(String(stripeContext||''))){
    throw Error('stripe_account_context_invalid');
  }
  if(livemode!==true&&livemode!==false)throw Error('stripe_mode_explicit_required');
  const date=String(observedDate||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){
    throw Error('stripe_observation_date_invalid');
  }
  return {
    schema:STRIPE_CONNECTION_SCHEMA,
    connection_key:STRIPE_CONNECTION_KEY,
    provider:'stripe',
    provider_role:'settlement_adapter',
    commerce_layer:'evercraft_payments',
    provider_boundary:'raven_nexus',
    stripe_context:String(stripeContext),
    account_name:safeName(accountName),
    livemode,
    last_observed_date:date,
    observed_via:'authorized_chatgpt_stripe_connector',
    credential_custody:'external_provider_managed',
    raven_nexus_credential_ref:null,
    systemia_runtime_authorized:false,
    binding_state:'account_identity_saved_auth_not_delegated',
    checkout_verified:false,
    payment_verified:false,
    settlement_verified:false,
    fulfillment_verified:false,
  };
}

function secureDirectory(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const info=fs.lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('stripe_registry_dir_not_private_directory');
  if((info.mode&0o077)!==0)throw Error('stripe_registry_dir_permissions_not_private');
  if(typeof process.getuid==='function'&&info.uid!==process.getuid()){
    throw Error('stripe_registry_dir_not_owned_by_current_user');
  }
}

export function readStripeConnectionReference({file=stripeConnectionPath()}={}){
  if(!fs.existsSync(file)) return null;
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0){
    throw Error('stripe_registry_file_not_private');
  }
  if(typeof process.getuid==='function'&&st.uid!==process.getuid()){
    throw Error('stripe_registry_file_wrong_owner');
  }
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.schema!==STRIPE_CONNECTION_SCHEMA||
     data.connection_key!==STRIPE_CONNECTION_KEY||
     data.provider!=='stripe'||
     data.commerce_layer!=='evercraft_payments'||
     data.provider_boundary!=='raven_nexus'||
     data.systemia_runtime_authorized!==false ||
     data.binding_state!=='account_identity_saved_auth_not_delegated' ||
     data.payment_verified!==false){
    throw Error('stripe_registry_schema_or_authority_invalid');
  }
  return data;
}

export function storeStripeConnectionReference(reference,{
  file=stripeConnectionPath(),allowReplace=false,
}={}){
  if(reference?.schema!==STRIPE_CONNECTION_SCHEMA||
     reference?.systemia_runtime_authorized!==false||
     reference?.credential_custody!=='external_provider_managed'){
    throw Error('stripe_connection_reference_invalid');
  }
  // Explicitly whitelist the schema; reject attempts to store keys/tokens.
  const clean=buildStripeConnectionReference({
    stripeContext:reference.stripe_context,
    accountName:reference.account_name,
    livemode:reference.livemode,
    observedDate:reference.last_observed_date,
  });
  if(Object.keys(reference).sort().join(',')!==Object.keys(clean).sort().join(',')){
    throw Error('stripe_connection_extra_or_secret_fields_forbidden');
  }
  secureDirectory(path.dirname(file));
  const old=readStripeConnectionReference({file});
  if(old&&(old.stripe_context!==clean.stripe_context||old.livemode!==clean.livemode)&&!allowReplace){
    throw Error('stripe_connection_switch_requires_explicit_replace');
  }
  if(old&&JSON.stringify(old)===JSON.stringify(clean)){
    return {saved:true,unchanged:true,file,livemode:clean.livemode,provider:'stripe',runtime_authorized:false};
  }
  const tmp=file+'.tmp-'+process.pid+'-'+Date.now().toString(36);
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0);
  let fd;
  try{
    fd=fs.openSync(tmp,flags,0o600);
    fs.writeFileSync(fd,JSON.stringify(clean,null,2)+'\n','utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    fs.renameSync(tmp,file);
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(tmp))fs.unlinkSync(tmp);
  }
  return {saved:true,unchanged:false,file,livemode:clean.livemode,provider:'stripe',runtime_authorized:false};
}

export function requireStripeRuntimeAuthorization(){
  // An account reference alone never grants signing or checkout authority.
  throw Error('stripe_runtime_auth_not_delegated_to_raven_nexus');
}

export function displayStripeConnectionStatus({file=stripeConnectionPath()}={}){
  const info=readStripeConnectionReference({file});
  if(!info)return {stored:false,provider:'stripe',runtime_authorized:false};
  return {
    stored:true,connection_key:info.connection_key,provider:info.provider,
    account_name:info.account_name,
    stripe_context_hint:info.stripe_context.slice(0,5)+'…'+info.stripe_context.slice(-4),
    livemode:info.livemode,last_observed_date:info.last_observed_date,
    binding_state:info.binding_state,
    runtime_authorized:false,checkout_verified:false,payment_verified:false,
  };
}
