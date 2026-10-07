import fs from "node:fs";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";

const clean=(value)=>String(value??"").trim();

export function resolvePayPalCompetitionSecret(env=process.env){
  const clientId=clean(env?.RAVEN_PAYPAL_CLIENT_ID||env?.PAYPAL_CLIENT_ID);
  const clientSecret=clean(env?.RAVEN_PAYPAL_CLIENT_SECRET||env?.PAYPAL_CLIENT_SECRET);
  if(clientId&&clientSecret){
    return {client_id:clientId,client_secret:clientSecret,source:"runtime_binding"};
  }

  const stateDir=clean(env?.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||env?.EVERCRAFT_CREDENTIAL_STATE_DIR);
  if(!stateDir||!fs.existsSync(stateDir)) return null;
  try{
    const vault=new ProviderCredentialVault({stateDir});
    const metadata=vault.list({provider:"paypal"})[0]||null;
    if(!metadata) return null;
    const secret=vault.readSecret(metadata.credential_ref);
    if(!clean(secret?.api_key_id)||!clean(secret?.api_secret)) return null;
    return {
      client_id:String(secret.api_key_id),
      client_secret:String(secret.api_secret),
      source:"owned_vault",
      credential_ref:metadata.credential_ref,
    };
  }catch{return null;}
}

export function payPalCompetitionSecretStatus(secret){
  return {
    schema:"evercraft.raven.paypal-sandbox-secret-status.v1",
    secret_boundary:"raven_nexus",
    paypal_configured:Boolean(secret?.client_id&&secret?.client_secret),
    source:secret?.source||null,
    credential_ref:secret?.source==="owned_vault"?secret?.credential_ref||null:null,
    secret_values_exposed:false,
  };
}
