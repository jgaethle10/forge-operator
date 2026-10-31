const SCOPE='home.clip.publish';
const PRODUCT='evercraft-home';
const SUBJECT='system:humanfilter-clip-publisher';
const RESOURCE='brand:evercraft';
const CAMPAIGN='humanfilter-desktop-beta-rotation-20261030';
const EXCLUSIONS=['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa'];
const clean=x=>String(x??'').trim();

export function validateHumanFilterAuthority(receipt,now=new Date()){
  if(receipt?.schema!=='evercraft.clip.operator-authority.v1'||receipt?.authorized!==true||receipt.authority_state!=='manual_authorized')throw Error('humanfilter_authority_not_valid');
  if(receipt.subject_ref!==SUBJECT||receipt.product!==PRODUCT||receipt.campaign_id!==CAMPAIGN)throw Error('humanfilter_authority_subject_or_campaign_invalid');
  if(JSON.stringify(receipt.scopes)!==JSON.stringify([SCOPE])||JSON.stringify(receipt.resource_refs)!==JSON.stringify([RESOURCE]))throw Error('humanfilter_authority_scope_invalid');
  if(EXCLUSIONS.some(x=>!(receipt.excluded_brand_keys||[]).includes(x)))throw Error('humanfilter_authority_exclusion_missing');
  if(!clean(receipt.authority_receipt_ref)||!clean(receipt.issuer_ref))throw Error('humanfilter_authority_issuer_missing');
  if(receipt.boundaries?.channel_scope!=='verified_evercraft_corporate_only'||receipt.boundaries?.paid_spend_usd!==0||receipt.boundaries?.first_comment_provider_receipt_required!==true)throw Error('humanfilter_authority_boundaries_invalid');
  if(receipt.boundaries?.minimum_hours_between_posts_per_platform<72||receipt.boundaries?.max_posts_per_platform_per_7_days>2)throw Error('humanfilter_authority_frequency_invalid');
  const start=Date.parse(receipt.starts_at),end=Date.parse(receipt.ends_at),time=now.getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||time<start||time>=end)throw Error('humanfilter_authority_not_current');
  return receipt;
}
export function installHumanFilterClipGrant({passport,receipt,now=new Date()}={}){
  if(!passport?.issueGrant)throw Error('humanfilter_passport_missing');
  const a=validateHumanFilterAuthority(receipt,now);
  const result=passport.issueGrant({
    grant_id:'grant_system_humanfilter_clip_evercraft_publisher',
    idempotency_key:'grant:humanfilter:evercraft:clip:v1',
    authority_state:'manual_authorized',
    authority_receipt_ref:a.authority_receipt_ref,
    subject_ref:SUBJECT,issuer_ref:a.issuer_ref,product:PRODUCT,
    scopes:[SCOPE],resource_refs:[RESOURCE],
    starts_at:a.starts_at,ends_at:a.ends_at,
    max_delegation_depth:0,
    purpose:a.purpose
  });
  return {status:result.state,grant_id:result.grant.grant_id,authority_ref:result.grant.authority_receipt_ref,secret_material_returned:false};
}
