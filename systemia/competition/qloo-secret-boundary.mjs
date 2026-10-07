import fs from "node:fs";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";

function clean(value){
  return String(value??"").trim();
}

export function resolveQlooCompetitionSecret(env=process.env){
  const runtime=clean(env?.RAVEN_QLOO_API_KEY||env?.QLOO_API_KEY);
  if(runtime){
    return {
      api_key:runtime,
      source:"runtime_binding",
    };
  }

  const stateDir=clean(
    env?.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||
    env?.EVERCRAFT_CREDENTIAL_STATE_DIR
  );
  if(!stateDir||!fs.existsSync(stateDir)) return null;

  try{
    const vault=new ProviderCredentialVault({stateDir});
    const metadata=vault.list({provider:"qloo"})[0]||null;
    if(!metadata) return null;
    const secret=vault.readSecret(metadata.credential_ref);
    if(!clean(secret?.api_secret)) return null;
    return {
      api_key:String(secret.api_secret),
      source:"owned_vault",
      credential_ref:metadata.credential_ref,
    };
  }catch{
    return null;
  }
}

export function qlooCompetitionSecretStatus(secret){
  return {
    schema:"evercraft.raven.qloo-secret-status.v1",
    secret_boundary:"raven_nexus",
    qloo_configured:Boolean(secret?.api_key),
    source:secret?.source||null,
    credential_ref:secret?.source==="owned_vault"
      ? secret?.credential_ref||null
      : null,
    secret_values_exposed:false,
  };
}
