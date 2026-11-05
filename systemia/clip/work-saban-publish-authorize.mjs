import {assertEvercraftFamilySocialSafe} from './family-social-safety.mjs';

export const WORK_SABAN_CAMPAIGN='work-saban-clip-evergreen-20261030';
export const WORK_SABAN_SUBJECT='system:work-saban-clip-publisher';
export const WORK_SABAN_RESOURCE='brand:evercraft-work-saban';
const SCOPE='home.clip.publish';
const EXCLUDED=['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa'];
const clean=x=>String(x??'').trim();

export function validateWorkSabanClipAuthority(receipt,now=new Date()){
  if(receipt?.schema!=='evercraft.clip.operator-authority.v1'||receipt.authorized!==true||receipt.authority_state!=='manual_authorized')
    throw Error('work_saban_clip_receipt_not_authorized');
  if(receipt.campaign_id!==WORK_SABAN_CAMPAIGN||receipt.subject_ref!==WORK_SABAN_SUBJECT||receipt.product!=='evercraft-home')
    throw Error('work_saban_clip_campaign_or_subject_mismatch');
  if(JSON.stringify(receipt.scopes)!==JSON.stringify([SCOPE])||JSON.stringify(receipt.resource_refs)!==JSON.stringify([WORK_SABAN_RESOURCE]))
    throw Error('work_saban_clip_scope_mismatch');
  if(!clean(receipt.issuer_ref)||!clean(receipt.authority_receipt_ref))throw Error('work_saban_clip_issuer_receipt_missing');
  if(EXCLUDED.some(b=>!(receipt.excluded_brand_keys||[]).includes(b)))throw Error('work_saban_clip_brand_exclusions_missing');
  const b=receipt.boundaries||{};
  if(b.channel_scope!=='verified_evercraft_corporate_only'||b.paid_spend_usd!==0||
     b.first_comment_provider_receipt_required!==true||b.no_personal_automated_posting!==true||
     b.minimum_hours_between_posts_per_platform<72||b.max_posts_per_platform_per_7_days>2)
    throw Error('work_saban_clip_authority_boundaries_invalid');
  const start=Date.parse(receipt.starts_at),end=Date.parse(receipt.ends_at),t=now.getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||t<start||t>=end)
    throw Error('work_saban_clip_authority_expired_or_future');
  // Editorial authorization is not a credential. Only a current issuer-backed receipt may install a grant.
  return receipt;
}
export function installWorkSabanClipGrant({passport,receipt,now=new Date()}={}){
  if(!passport?.issueGrant)throw Error('work_saban_clip_passport_missing');
  const a=validateWorkSabanClipAuthority(receipt,now);
  const r=passport.issueGrant({
    grant_id:'grant_system_work_saban_clip_company',
    idempotency_key:'grant:work-saban:evercraft:clip:v1',
    authority_state:'manual_authorized',
    authority_receipt_ref:a.authority_receipt_ref,
    subject_ref:WORK_SABAN_SUBJECT,issuer_ref:a.issuer_ref,product:'evercraft-home',
    scopes:[SCOPE],resource_refs:[WORK_SABAN_RESOURCE],
    starts_at:a.starts_at,ends_at:a.ends_at,max_delegation_depth:0,
    purpose:'Publish only bounded Work Saban campaign entries through authorized Evercraft company Clip accounts'
  });
  return {status:r.state,grant_id:r.grant.grant_id,authority_ref:r.grant.authority_receipt_ref,secret_material_returned:false};
}
export function validateWorkSabanText(entry){
  if(!entry||entry.brand_key!=='evercraft-work-saban'||entry.platform!=='facebook'||entry.destination!=='facebook-page')
    throw Error('work_saban_clip_destination_not_allowed');
  if(entry.account_scope!=='verified_evercraft_company_channel_only'||entry.link_mode!=='first_comment'||entry.first_comment_required!==true)
    throw Error('work_saban_clip_social_rules_mismatch');
  if(entry.distribution?.paid_spend_usd!==0||entry.distribution?.max_identical_reuse!==0)
    throw Error('work_saban_clip_paid_or_duplicate_policy_invalid');
  if(entry.publisher_state!=='not_submitted'||entry.publicationAuthority!==false)
    throw Error('work_saban_clip_entry_already_submitted_or_privileged');
  if(!entry.caption||entry.caption.length>4000||/https?:\/\//i.test(entry.caption))
    throw Error('work_saban_clip_caption_invalid');
  const u=new URL(entry.first_comment_copy);
  if(u.protocol!=='https:'||u.hostname!=='jgaethle10.github.io'||
     u.pathname!=='/forge-operator/work-saban/report/'||
     u.searchParams.get('utm_content')!==entry.id.replace('work-saban-rotation-','').replace(/-(?=facebook$)/,'-'))
    throw Error('work_saban_clip_tracked_comment_invalid');
  assertEvercraftFamilySocialSafe({message:entry.caption,link:entry.first_comment_copy});
  return entry;
}
