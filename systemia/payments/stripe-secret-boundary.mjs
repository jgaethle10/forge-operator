import fs from 'node:fs';
import {ProviderCredentialVault} from '../evercraft-home/credential-vault.mjs';

const clean=(value)=>String(value??'').trim();

export function resolveStripeSettlementSecret(env=process.env){
  const runtime=clean(env?.RAVEN_STRIPE_SECRET_KEY||env?.STRIPE_SECRET_KEY);
  if(runtime){
    return {
      secret_key:runtime,
      source:'runtime_binding',
      credential_ref:null,
    };
  }

  const stateDir=clean(
    env?.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||
    env?.EVERCRAFT_CREDENTIAL_STATE_DIR
  );
  if(!stateDir||!fs.existsSync(stateDir)) return null;
  try{
    const vault=new ProviderCredentialVault({stateDir});
    const metadata=vault.list({provider:'stripe'})
      .find((row)=>row.environment==='live')||
      vault.list({provider:'stripe'})[0]||
      null;
    if(!metadata) return null;
    const secret=vault.readSecret(metadata.credential_ref);
    if(!clean(secret?.api_secret)) return null;
    return {
      secret_key:String(secret.api_secret),
      source:'owned_vault',
      credential_ref:metadata.credential_ref,
    };
  }catch{
    return null;
  }
}

export function stripeSettlementSecretStatus(secret){
  return {
    schema:'evercraft.raven.stripe-settlement-secret-status.v1',
    secret_boundary:'raven_nexus',
    provider:'stripe',
    provider_role:'settlement_adapter',
    configured:Boolean(secret?.secret_key),
    source:secret?.source||null,
    credential_ref:secret?.source==='owned_vault'?secret?.credential_ref||null:null,
    secret_values_exposed:false,
  };
}
