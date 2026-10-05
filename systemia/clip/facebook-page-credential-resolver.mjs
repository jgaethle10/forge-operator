import path from 'node:path';
import { ProviderCredentialVault } from '../evercraft-home/credential-vault.mjs';

function clean(value){
  return String(value ?? '').trim();
}

function resolveStateDir(env=process.env){
  const explicit=clean(env.EVERCRAFT_CREDENTIAL_STATE_DIR);
  if(explicit) return explicit;
  const identity=clean(env.EVERCRAFT_IDENTITY_STATE_DIR);
  return identity ? path.join(identity,'provider-credentials') : '';
}

export function resolveFacebookPageCredential({
  env=process.env,
  credentialStateDir=resolveStateDir(env),
}={}){
  const credentialRef=clean(env.CLIP_FACEBOOK_CREDENTIAL_REF);
  if(!credentialRef){
    return {
      config:{},
      safe_status:{
        vault_state:credentialStateDir?'configured':'credential_vault_not_configured',
        facebook:'credential_ref_missing',
        secret_material_returned:false,
      },
    };
  }

  if(!credentialStateDir){
    return {
      config:{},
      safe_status:{
        vault_state:'credential_vault_not_configured',
        facebook:'blocked_vault_not_configured',
        credential_ref:credentialRef,
        secret_material_returned:false,
      },
    };
  }

  try{
    const vault=new ProviderCredentialVault({stateDir:credentialStateDir});
    const metadata=vault.list({provider:'facebook-pages'})
      .find(row=>row.credential_ref===credentialRef) || null;
    if(!metadata){
      return {
        config:{},
        safe_status:{
          vault_state:'configured',
          facebook:'credential_ref_provider_mismatch_or_missing',
          credential_ref:credentialRef,
          secret_material_returned:false,
        },
      };
    }

    const secret=vault.readSecret(credentialRef);
    const pageId=clean(secret.api_key_id);
    const pageAccessToken=clean(secret.api_secret);
    if(!pageId||!pageAccessToken){
      return {
        config:{},
        safe_status:{
          vault_state:'configured',
          facebook:'credential_payload_invalid',
          credential_ref:credentialRef,
          secret_material_returned:false,
        },
      };
    }

    return {
      config:{pageId,pageAccessToken},
      safe_status:{
        vault_state:'configured',
        facebook:'resolved',
        credential_ref:credentialRef,
        credential_fingerprint:metadata.credential_fingerprint,
        updated_at:metadata.updated_at,
        secret_material_returned:false,
      },
    };
  }catch(error){
    return {
      config:{},
      safe_status:{
        vault_state:'configured',
        facebook:'credential_resolution_failed',
        credential_ref:credentialRef,
        error:error instanceof Error?error.message:String(error),
        secret_material_returned:false,
      },
    };
  }
}
