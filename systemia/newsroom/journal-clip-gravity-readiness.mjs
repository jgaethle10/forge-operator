import { resolveFacebookPageCredential } from '../clip/facebook-page-credential-resolver.mjs';
import { buildGravityClipFallbackRequest } from './journal-clip-gravity.mjs';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const clean = value => String(value ?? '').trim();
const schema = 'evercraft.journal.gravity-resident-readiness.v1';

export async function checkFacebookPageIdentityReadOnly({
  pageId, pageAccessToken, fetchImpl=globalThis.fetch, graphVersion='v26.0',
}={}){
  // This is a no-side-effect GET. It proves Page identity, not write permissions.
  if (!/^[0-9]{5,30}$/.test(clean(pageId)) || !clean(pageAccessToken)) {
    return {state:'credential_identity_invalid', verified:false, publish_permission_verified:false};
  }
  const url='https://graph.facebook.com/'+encodeURIComponent(graphVersion)+'/'+pageId+'?fields=id,name';
  try{
    const response=await fetchImpl(url,{
      method:'GET',
      headers:{Authorization:'Bearer '+pageAccessToken,Accept:'application/json'},
      signal:AbortSignal.timeout(12000),
      redirect:'error',
    });
    if(!response.ok){
      return {state:'provider_page_read_failed',http_status:response.status,verified:false,publish_permission_verified:false};
    }
    const body=await response.json();
    if(clean(body?.id)!==clean(pageId) || !clean(body?.name)){
      return {state:'provider_page_identity_mismatch',verified:false,publish_permission_verified:false};
    }
    return {
      state:'page_identity_verified_read_only',
      verified:true,page_id:clean(body.id),page_name:clean(body.name),
      publish_permission_verified:false,
    };
  }catch{
    // Never surface provider payloads that could include secrets or user data.
    return {state:'provider_page_probe_unavailable',verified:false,publish_permission_verified:false};
  }
}

function stateReadiness(root,requestId){
  if(!clean(root))return {state:'missing_durable_root',ready:false};
  const absolute=path.resolve(root);
  if(!fs.existsSync(absolute))return {state:'durable_root_not_created',ready:false};
  try{
    if(!fs.statSync(absolute).isDirectory())return {state:'durable_root_not_directory',ready:false};
    fs.accessSync(absolute,fs.constants.R_OK|fs.constants.W_OK);
    const ledger=path.join(absolute,requestId+'.json');
    if(fs.existsSync(ledger)){
      const item=JSON.parse(fs.readFileSync(ledger,'utf8'));
      return {
        state:'existing_attempt_requires_reconciliation',ready:false,
        prior_status:clean(item.status)||'unknown',
        provider_published:item.provider_published===true,
        prior_remote_id:clean(item.provider_receipt?.remoteId)||null,
      };
    }
    return {state:'durable_root_accessible',ready:true};
  }catch{
    return {state:'durable_root_unreadable_or_invalid',ready:false};
  }
}

/**
 * A read-only status inspection; it NEVER signs a story or calls a mutating
 * provider endpoint. It does not mistake a working Page token for POST scope.
 */
export async function inspectGravityResident({
  release, trustedPublicKey, stateRoot, credentialStateDir, now=new Date(),
  checkProviderIdentity=false, fetchImpl=globalThis.fetch,
  credentialResolver=resolveFacebookPageCredential,
}={}){
  const receipt={
    schema, observed_at:now.toISOString(),state:'blocked',
    provider_published:false, provider_mutation_attempted:false,
    release:{state:'unverified'},
    durable_claim:{state:'not_checked'},
    credential:{state:'not_checked'},
    facebook_page:{state:'not_checked',verified:false,publish_permission_verified:false},
  };
  let request=null;
  try{
    request=buildGravityClipFallbackRequest(release,{now,trustedPublicKey});
    receipt.release={state:'signed_and_within_release_gates',story_id:request.lineage.story_id,
      request_id:request.id,operator_attestation_id:request.lineage.operator_attestation_id};
  }catch(error){
    receipt.release={state:'invalid',reason:clean(error?.message)||'unknown'};
  }
  if(request)receipt.durable_claim=stateReadiness(stateRoot,request.id);
  let credentials=null;
  try{
    credentials=credentialResolver({credentialStateDir});
    receipt.credential={state:clean(credentials?.safe_status?.facebook)||'credential_unavailable',
      // credential ref is an identifier, not a secret, but only expose Page ID after authenticated GET.
      secret_material_returned:false,
    };
    if(receipt.credential.state==='resolved' && checkProviderIdentity){
      receipt.facebook_page=await checkFacebookPageIdentityReadOnly({
        ...credentials.config,fetchImpl,
      });
    }else if(receipt.credential.state==='resolved'){
      receipt.facebook_page={state:'remote_page_not_checked',verified:false,publish_permission_verified:false};
    }
  }catch{
    receipt.credential={state:'credential_read_failed',secret_material_returned:false};
  }
  const eligible=Boolean(request && receipt.durable_claim.ready &&
    receipt.credential.state==='resolved' && receipt.facebook_page.verified===true);
  receipt.state=eligible?'manual_publish_preflight_ready_write_permission_unverified':'blocked';
  receipt.operator_next_action=!request?'obtain_authentic_signed_approved_release':
    !receipt.durable_claim.ready?'configure_or_reconcile_durable_state':
    receipt.credential.state!=='resolved'?'configure_page_credential_in_owned_vault':
    !checkProviderIdentity?'rerun_with_read_only_page_identity_probe':
    !receipt.facebook_page.verified?'repair_provider_page_identity_or_token':
    'confirm_pages_manage_posts_and_editorial_current_state_before_manual_fire';
  return receipt;
}

function arg(flag,fallback=''){
  const i=process.argv.indexOf(flag);
  return i>=0?clean(process.argv[i+1]):fallback;
}
async function main(){
  const file=arg('--signed-release');
  const key=arg('--trusted-public-key-file',process.env.EVERCRAFT_CLIP_GRAVITY_TRUSTED_PUBLIC_KEY_FILE||'');
  const stateRoot=arg('--state-root',process.env.EVERCRAFT_CLIP_GRAVITY_STATE_DIR||'');
  const credentialStateDir=arg('--credential-state-dir',process.env.EVERCRAFT_CREDENTIAL_STATE_DIR||'');
  let release=null,trustedPublicKey=null;
  try{if(file)release=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));}catch{}
  try{if(key)trustedPublicKey=fs.readFileSync(path.resolve(key),'utf8');}catch{}
  const receipt=await inspectGravityResident({
    release,trustedPublicKey,stateRoot,credentialStateDir,
    checkProviderIdentity:process.argv.includes('--check-page-identity'),
  });
  console.log(JSON.stringify(receipt,null,2));
  if(receipt.state!=='manual_publish_preflight_ready_write_permission_unverified')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
