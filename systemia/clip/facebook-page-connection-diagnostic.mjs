// Private, read-only Evercraft Clip Facebook Page diagnostics.
// No provider writes, token disclosure, or inferences that GET access grants POST scope.
import {resolveFacebookPageCredential} from './facebook-page-credential-resolver.mjs';

const clean=value=>String(value??'').trim();
const required_permissions=Object.freeze(['pages_show_list','pages_read_engagement','pages_manage_posts']);
const SAFE_META_CODES=new Set([10,100,190,200,283]);
function safeMetaCode(body){
  const code=Number(body?.error?.code);
  return Number.isInteger(code)&&SAFE_META_CODES.has(code)?code:null;
}
function result(state,fields={}){
  return {
    schema:'evercraft.clip.facebook-connection-diagnostic.v1',
    provider:'facebook',
    state,
    page_identity_verified:false,
    page_content_read_verified:false,
    publish_permission_verified:false,
    provider_mutation_attempted:false,
    publish_performed:false,
    secret_material_returned:false,
    required_permissions,
    ...fields,
  };
}
async function getGraph({fetchImpl,graphBase,version,path,pageAccessToken}){
  const res=await fetchImpl(graphBase+'/'+version+'/'+path,{
    method:'GET',
    headers:{Authorization:'Bearer '+pageAccessToken,Accept:'application/json'},
    redirect:'error',
    signal:AbortSignal.timeout(10000),
  });
  let body=null;
  try{body=await res.json();}catch{}
  return {ok:res?.status>=200&&res.status<300,status:Number(res?.status)||null,
    body,meta_error_code:safeMetaCode(body)};
}
/**
 * Read-only diagnosis. The selected credential stays in the private owned vault;
 * HTTP responses only include fixed status codes and provider-confirmed Page metadata.
 * Even a fully green GET is NOT evidence that a POST will be authorized.
 */
export async function inspectClipFacebookConnection({
  credentialStateDir,credentialRef='',fetchImpl=globalThis.fetch,
  resolver=resolveFacebookPageCredential,graphBase='https://graph.facebook.com',
  graphVersion='v26.0',
}={}){
  if(!clean(credentialStateDir)) return result('credential_vault_not_configured',{next_action:'configure_private_credential_vault'});
  const selection=clean(credentialRef);
  if(selection.length>256) return result('credential_selection_invalid',{next_action:'choose_sealed_page_credential'});
  let resolved;
  try{
    resolved=resolver({credentialStateDir,env:{CLIP_FACEBOOK_CREDENTIAL_REF:selection}});
  }catch{return result('credential_resolution_failed',{next_action:'check_private_vault'});}
  const status=clean(resolved?.safe_status?.facebook)||'credential_unavailable';
  if(status!=='resolved'){
    return result(status,{
      credential_candidate_count:Number.isInteger(resolved?.safe_status?.candidate_count)?resolved.safe_status.candidate_count:null,
      next_action:status==='credential_selection_ambiguous'?'choose_sealed_page_credential':'seal_valid_page_credential'
    });
  }
  const pageId=clean(resolved?.config?.pageId),token=clean(resolved?.config?.pageAccessToken);
  if(!/^[0-9]{5,30}$/.test(pageId)||!token) return result('credential_payload_invalid',{next_action:'replace_page_credential'});
  if(typeof fetchImpl!=='function')return result('provider_network_unavailable',{next_action:'run_probe_on_owned_runtime'});
  const base=clean(graphBase).replace(/\/+$/,'');
  const version=clean(graphVersion).replace(/^\/+|\/+$/g,'');
  let page;
  try{
    page=await getGraph({fetchImpl,graphBase:base,version,
      path:encodeURIComponent(pageId)+'?fields=id%2Cname',pageAccessToken:token});
  }catch{
    return result('provider_network_unavailable',{next_action:'check_owned_runtime_outbound_access'});
  }
  if(!page.ok){
    return result('page_identity_read_denied',{
      http_status:page.status,meta_error_code:page.meta_error_code,
      next_action:page.meta_error_code===190?'renew_page_access_token':'review_meta_page_access'
    });
  }
  const confirmedId=clean(page.body?.id),pageName=clean(page.body?.name);
  if(confirmedId!==pageId||!pageName){
    return result('page_identity_mismatch',{next_action:'verify_exact_company_page_id'});
  }
  const idFields={page_identity_verified:true,page_id:confirmedId,page_name:pageName,
    company_brand_name_match:/\b(?:evercraft|systemia)\b/i.test(pageName)};
  if(!idFields.company_brand_name_match){
    return result('page_brand_requires_review',{...idFields,next_action:'verify_page_is_an_approved_company_brand'});
  }
  // The list can be empty and still prove GET authorization. We never expose post content.
  let posts;
  try{
    posts=await getGraph({fetchImpl,graphBase:base,version,
      path:encodeURIComponent(pageId)+'/published_posts?limit=1&fields=id',pageAccessToken:token});
  }catch{
    return result('page_content_read_unavailable',{...idFields,next_action:'check_meta_read_engagement_access'});
  }
  if(!posts.ok){
    return result('page_content_read_denied',{
      ...idFields,http_status:posts.status,meta_error_code:posts.meta_error_code,
      next_action:'reconnect_meta_pages_read_engagement'
    });
  }
  if(!Array.isArray(posts.body?.data)){
    return result('page_content_read_invalid',{...idFields,next_action:'investigate_provider_response'});
  }
  return result('read_only_verified_write_unverified',{
    ...idFields,page_content_read_verified:true,
    next_action:'verify_pages_manage_posts_and_create_content_task_before_authorized_publish',
  });
}
