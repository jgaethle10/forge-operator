// Affiliate commerce admission. A normal merchant URL or a UTM string is not
// an approved revenue-generating affiliate link.
// This module does not create accounts, authorize campaigns or send visitors anywhere.
const FAMILY_NICHES=new Set(['pets','tools','car_parts','collectibles_and_parts']);
function safeHttps(value) {
 let url;
 try {url=new URL(String(value));} catch {throw new Error('affiliate_url_invalid');}
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('affiliate_https_required');
 if(!url.hostname||url.hostname==='localhost')throw new Error('affiliate_host_invalid');
 return url.toString();
}
export function admitAffiliatePlacement({
 program,placementProperty,propertyNiche,trackingLink,merchantApprovalReceipt,
 disclosure,operatorApproved=false,adultPreflight=null
}={}){
 if(!program?.id)throw new Error('affiliate_program_missing');
 if(program.program_state!=='approved')throw new Error('affiliate_program_not_approved');
 if(!operatorApproved)throw new Error('affiliate_operator_authorization_missing');
 if(!merchantApprovalReceipt?.approval_id||merchantApprovalReceipt?.status!=='approved'){
  throw new Error('affiliate_merchant_approval_receipt_missing');
 }
 const url=safeHttps(placementProperty),destination=safeHttps(trackingLink);
 const allowed=(program.approved_site_refs||[]).map(safeHttps);
 if(!allowed.includes(url))throw new Error('affiliate_property_not_registered_with_merchant');
 if(!String(disclosure??'').toLowerCase().includes('commission'))throw new Error('affiliate_commission_disclosure_required');
 const isAdult=program.niche==='adult_products'||program.niche==='age_restricted_entertainment';
 if(isAdult){
  if(!adultPreflight||adultPreflight.status!=='fully_verified'||adultPreflight.separate_brand!==true
      ||adultPreflight.age_compliance_verified!==true||adultPreflight.rights_verified!==true
      ||adultPreflight.host_and_processor_approved!==true)
    throw new Error('affiliate_adult_separation_and_compliance_hold');
  if(url.includes('/forge-operator/')||url.includes('evercraft'))throw new Error('affiliate_adult_family_origin_blocked');
 }else if(!FAMILY_NICHES.has(propertyNiche)){
  throw new Error('affiliate_unrecognized_family_niche');
 }
 return {href:destination,rel:'sponsored noopener noreferrer',disclosure:String(disclosure),program:program.id,status:'authorized_placement_not_a_paid_receipt'};
}
