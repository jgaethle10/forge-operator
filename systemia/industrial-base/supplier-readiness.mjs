const clean=(v)=>String(v??'').replace(/\s+/g,' ').trim();
const unique=(values=[])=>[...new Set(values.map(clean).filter(Boolean))];

export function normalizeSupplierProfile(raw={}){
  const company=clean(raw.company);
  if(!company) throw new TypeError('company is required');
  const capabilities=unique(raw.capabilities);
  if(!capabilities.length) throw new TypeError('at least one capability is required');
  return {
    schema:'evercraft.industrial-base.supplier-profile.v1',
    company,
    capabilities,
    evidence_refs:unique(raw.evidence_refs),
    certifications:unique(raw.certifications),
    registrations:raw.registrations&&typeof raw.registrations==='object'?structuredClone(raw.registrations):{},
    boundaries:{
      public_or_authorized_inputs_only:true,
      no_classified_requirement_inference:true,
      no_bid_or_award_guarantee:true
    }
  };
}

export function normalizeBuyerEntryChannel(raw={}){
  const buyer=clean(raw.buyer);
  if(!buyer) throw new TypeError('buyer is required');
  const categories=(raw.categories||[]).map((row)=>({
    key:clean(row.key).toLowerCase(),
    label:clean(row.label||row.key),
    terms:unique(row.terms).map((x)=>x.toLowerCase())
  })).filter((row)=>row.key&&row.terms.length);
  if(!categories.length) throw new TypeError('buyer channel requires public categories');
  const source_refs=unique(raw.source_refs);
  if(!source_refs.length) throw new TypeError('buyer channel requires source_refs');
  return {
    schema:'evercraft.industrial-base.buyer-entry-channel.v1',
    buyer,
    categories,
    registration_path:clean(raw.registration_path),
    source_refs,
    disclaimer:clean(raw.disclaimer),
    sensitive_program_mapping_allowed:false
  };
}

export function buildPublicSupplierReadiness(profileInput,channelInput){
  const profile=normalizeSupplierProfile(profileInput);
  const channel=normalizeBuyerEntryChannel(channelInput);
  const haystack=profile.capabilities.join(' ').toLowerCase();

  const matches=channel.categories.map((category)=>{
    const matched_terms=category.terms.filter((term)=>haystack.includes(term));
    return {
      category_key:category.key,
      category_label:category.label,
      matched_terms,
      matched:matched_terms.length>0
    };
  }).filter((row)=>row.matched);

  const missing=[];
  if(!profile.evidence_refs.length) missing.push('capability_evidence');
  if(!profile.registrations?.buyer_capability_profile) missing.push('buyer_capability_registration');
  if(!profile.registrations?.sam_gov) missing.push('sam_gov_status');
  if(!profile.certifications.length) missing.push('certification_evidence_or_explicit_none');

  return {
    schema:'evercraft.industrial-base.supplier-readiness.v1',
    company:profile.company,
    buyer:channel.buyer,
    matched_public_categories:matches,
    readiness_state:missing.length?'incomplete':'profile_complete_for_public_entry_review',
    missing,
    registration_path:channel.registration_path||null,
    evidence_refs:[...new Set([...profile.evidence_refs,...channel.source_refs])],
    boundary:{
      statement:'This packet matches a company only to the buyer\'s published general categories and entry process. It does not claim program-specific demand, eligibility, selection, award probability or access to controlled requirements.',
      sensitive_program_mapping_allowed:false
    }
  };
}
