import fs from "node:fs";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
const clean=(value)=>String(value??"").trim();
export function resolveNebiusCompetitionSecret(env=process.env){
  const runtime=clean(env?.RAVEN_NEBIUS_TOKEN_FACTORY_KEY||env?.NEBIUS_TOKEN_FACTORY_KEY||env?.NEBIUS_API_KEY);
  if(runtime) return {api_key:runtime,source:"runtime_binding"};
  const stateDir=clean(env?.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR||env?.EVERCRAFT_CREDENTIAL_STATE_DIR);
  if(!stateDir||!fs.existsSync(stateDir)) return null;
  try{
    const vault=new ProviderCredentialVault({stateDir});
    const metadata=vault.list({provider:"nebius"})[0]||null;
    if(!metadata) return null;
    const secret=vault.readSecret(metadata.credential_ref);
    if(!clean(secret?.api_secret)) return null;
    return {api_key:String(secret.api_secret),source:"owned_vault",credential_ref:metadata.credential_ref};
  }catch{return null;}
}
export function nebiusCompetitionSecretStatus(secret){
  return {schema:"evercraft.raven.nebius-token-factory-secret-status.v1",secret_boundary:"raven_nexus",nebius_configured:Boolean(secret?.api_key),source:secret?.source||null,credential_ref:secret?.source==="owned_vault"?secret?.credential_ref||null:null,secret_values_exposed:false};
}
