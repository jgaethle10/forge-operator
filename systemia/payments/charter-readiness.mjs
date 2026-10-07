export const CHARTER_PATHS=Object.freeze({
  federal_credit_union:{
    path_key:'federal_credit_union',
    ownership_model:'member_owned_cooperative',
    primary_chartering_authority:'NCUA',
    official_sources:[
      'https://ncua.gov/support-services/credit-union-resources-expansion/starting-new-federal-credit-union',
      'https://publishedguides.ncua.gov/charteringmanual/Content/Resources/PDFs/2026-03-30%20Charter%20Application%20Guide.pdf'
    ],
    requirements:[
      'purpose_and_need',
      'field_of_membership',
      'capital_funding_plan',
      'subscriber_team',
      'potential_member_survey',
      'market_analysis',
      'critical_sponsor_commitments',
      'mentor_relationships',
      'business_plan',
      'organizational_management_plan',
      'pro_forma_financials',
      'bylaws',
      'operational_policies',
      'share_insurance_path',
      'independent_regulatory_counsel'
    ]
  },
  washington_state_credit_union:{
    path_key:'washington_state_credit_union',
    ownership_model:'member_owned_cooperative',
    primary_chartering_authority:'Washington DFI Division of Credit Unions',
    official_sources:[
      'https://dfi.wa.gov/credit-unions/for-credit-unions',
      'https://ncua.gov/support-services/credit-union-resources-expansion/starting-new-federal-credit-union/faqs-new-state-charter-applicants-and-federal-share-insurance'
    ],
    requirements:[
      'purpose_and_need',
      'field_of_membership',
      'capital_funding_plan',
      'governance_management_plan',
      'business_plan',
      'pro_forma_financials',
      'bylaws',
      'operational_policies',
      'state_charter_application',
      'share_insurance_path',
      'independent_regulatory_counsel'
    ]
  },
  washington_state_bank:{
    path_key:'washington_state_bank',
    ownership_model:'investor_or_other_approved_bank_ownership',
    primary_chartering_authority:'Washington DFI Division of Banks',
    official_sources:[
      'https://dfi.wa.gov/banks/forms',
      'https://dfi.wa.gov/banks/faqs',
      'https://www.fdic.gov/regulations/applications/handbook.pdf'
    ],
    requirements:[
      'business_plan',
      'organizers_directors_officers',
      'capital_plan',
      'market_and_demographic_support',
      'notice_of_intent',
      'interagency_charter_and_deposit_insurance_application',
      'biographical_and_financial_reports',
      'community_reinvestment_assessment',
      'records_systems_and_controls',
      'compliance_program',
      'three_year_financial_projections',
      'independent_regulatory_counsel'
    ]
  }
});

export function verifiedEvidence(item){
  return Boolean(item && item.status==='verified' && item.ref && String(item.ref).trim());
}

export function buildCharterReadiness({pathKey,evidence={}}={}){
  const path=CHARTER_PATHS[pathKey];
  if(!path) throw new Error('unknown charter path');
  const requirements=path.requirements.map(key=>({
    key,
    verified:verifiedEvidence(evidence[key]),
    ref:verifiedEvidence(evidence[key])?String(evidence[key].ref):null
  }));
  const verified=requirements.filter(x=>x.verified).length;
  const missing=requirements.filter(x=>!x.verified).map(x=>x.key);
  return {
    schema:'evercraft.financial.charter-readiness.v1',
    path_key:path.path_key,
    ownership_model:path.ownership_model,
    primary_chartering_authority:path.primary_chartering_authority,
    official_sources:path.official_sources,
    verified_requirements:verified,
    total_requirements:requirements.length,
    readiness_percent:Math.round((verified/requirements.length)*100),
    application_ready:missing.length===0,
    missing_requirements:missing,
    requirements,
    regulated_execution_authorized:false,
    boundary:'Application readiness is not charter approval, deposit/share insurance, or authority to conduct regulated banking activity.'
  };
}

export function compareCharterPaths({evidenceByPath={}}={}){
  return Object.keys(CHARTER_PATHS).map(pathKey=>buildCharterReadiness({
    pathKey,
    evidence:evidenceByPath[pathKey]||{}
  })).sort((a,b)=>b.readiness_percent-a.readiness_percent || a.path_key.localeCompare(b.path_key));
}
