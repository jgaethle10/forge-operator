// OpenFEMA NFIP Redacted Claims v3, area-level historical loss evidence.
// This adapter never accepts parcel coordinates, addresses, claim identifiers
// from callers, or property-specific lookup requests. Do not expose raw rows.
const API='https://www.fema.gov/api/open/v3/NfipClaims';
export const NFIP_CLAIMS_V3_SOURCE=Object.freeze({
  endpoint:API,
  dataset:'NFIP Redacted Claims - v3',
  documentation:'https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3',
  owner:'Federal Emergency Management Agency',
  evidence_state:'REPORTED'
});
const MIN_ROWS_FOR_PUBLIC_RESULT=11;
const SELECT_FIELDS='id,state,yearOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim';
const DEFAULT_PAGE_SIZE=1000;
function requireState(state){
  if(typeof state!=='string'||!/^[A-Z]{2}$/.test(state))throw new TypeError('nfip_explicit_two_letter_state_required');
  return state;
}
function requireYear(year,label){
  if(!Number.isInteger(year)||year<1978||year>new Date().getUTCFullYear())throw new TypeError(label+'_invalid');
  return year;
}
export function buildNfipClaimsV3PageUrl({state,firstYear,lastYear,skip=0,pageSize=DEFAULT_PAGE_SIZE}={}){
  const validState=requireState(state),start=requireYear(firstYear,'nfip_first_year'),end=requireYear(lastYear,'nfip_last_year');
  if(end<start||end-start>20)throw new TypeError('nfip_year_window_invalid');
  if(!Number.isSafeInteger(skip)||skip<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>1000){
    throw new TypeError('nfip_pagination_invalid');
  }
  const params=new URLSearchParams();
  params.set('$filter',"state eq '"+validState+"' and yearOfLoss ge "+start+' and yearOfLoss le '+end);
  params.set('$select',SELECT_FIELDS);
  params.set('$top',String(pageSize));
  params.set('$skip',String(skip));
  return API+'?'+params.toString();
}
function validAmount(value){
  if(value===null||value===undefined||value==='')return 0;
  const number=typeof value==='number'?value:Number(value);
  if(!Number.isFinite(number)||Math.abs(number)>1e11)throw new Error('nfip_unreliable_payment_value');
  return number; // Keep official signed adjustments rather than inventing a positive sum.
}
async function loadPage(url,fetchImpl){
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),20000);
  try{
    const response=await fetchImpl(url,{
      method:'GET',redirect:'error',signal:abort.signal,
      headers:{accept:'application/json','user-agent':'Evercraft-FAIE/1.0 (area history, evidence only)'}
    });
    if(!response?.ok)throw new Error('nfip_official_source_unavailable');
    const body=await response.text();
    if(body.length>1800000)throw new Error('nfip_page_exceeds_bounded_limit');
    let parsed;
    try{parsed=JSON.parse(body)}catch{throw new Error('nfip_official_json_invalid')}
    if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.NfipClaims)||parsed.NfipClaims.length>1000){
      throw new Error('nfip_v3_schema_unverified');
    }
    return parsed.NfipClaims;
  }finally{
    clearTimeout(timeout);
  }
}
/**
 * Aggregate official redacted claim transactions across an explicit US state and
 * loss-year window. No raw record is returned or persisted by this function.
 *
 * Year range is inclusive. Caller must separately validate the source's
 * publication currency and decide whether to surface the aggregated receipt.
 * The result is NOT an incidence rate, local site history or insurability verdict.
 */
export async function collectNfipStateLossHistory({
  state,firstYear,lastYear,fetchImpl=globalThis.fetch,
  retrievedAt=new Date().toISOString(),pageSize=DEFAULT_PAGE_SIZE,maxPages=25
}={}){
  buildNfipClaimsV3PageUrl({state,firstYear,lastYear,pageSize});
  if(typeof fetchImpl!=='function')throw new TypeError('nfip_fetch_required');
  if(!Number.isFinite(Date.parse(retrievedAt)))throw new TypeError('nfip_retrieval_time_invalid');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw new TypeError('nfip_page_limit_invalid');
  const ids=new Set();
  let count=0,building=0,contents=0,compliance=0,completed=false;
  for(let page=0;page<maxPages;page++){
    const url=buildNfipClaimsV3PageUrl({state,firstYear,lastYear,skip:page*pageSize,pageSize});
    const rows=await loadPage(url,fetchImpl);
    for(const record of rows){
      if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('nfip_row_malformed');
      const year=Number(record.yearOfLoss);
      if(record.state!==state||!Number.isInteger(year)||year<firstYear||year>lastYear){
        throw new Error('nfip_row_outside_requested_scope');
      }
      const id=record.id;
      if(typeof id!=='string'&&typeof id!=='number')throw new Error('nfip_source_identifier_missing');
      if(ids.has(String(id)))throw new Error('nfip_repeated_claim_between_pages');
      ids.add(String(id));
      count++;
      building+=validAmount(record.amountPaidOnBuildingClaim);
      contents+=validAmount(record.amountPaidOnContentsClaim);
      compliance+=validAmount(record.amountPaidOnIncreasedCostOfComplianceClaim);
    }
    if(rows.length<pageSize){completed=true;break;}
  }
  if(!completed)throw new Error('nfip_incomplete_pagination_no_public_result');
  const sufficient=count>=MIN_ROWS_FOR_PUBLIC_RESULT;
  return {
    schema:'evercraft.faie.nfip-state-loss-history.v1',
    source_family:'fema-nfip-redacted-claims-v3',
    source:NFIP_CLAIMS_V3_SOURCE.dataset,
    evidence_state:'REPORTED',
    status:sufficient?'area_aggregate_available':'insufficient_area_records_suppressed',
    geography:{level:'state',state},
    loss_year_range:{first:firstYear,last:lastYear},
    retrieved_at:new Date(retrievedAt).toISOString(),
    // Never return small cohorts or raw record IDs; no address or parcel resolution.
    claim_transactions:sufficient?count:null,
    total_paid_usd:sufficient?Math.round((building+contents+compliance)*100)/100:null,
    building_paid_usd:sufficient?Math.round(building*100)/100:null,
    contents_paid_usd:sufficient?Math.round(contents*100)/100:null,
    compliance_paid_usd:sufficient?Math.round(compliance*100)/100:null,
    suppression_threshold:MIN_ROWS_FOR_PUBLIC_RESULT,
    source_urls:[NFIP_CLAIMS_V3_SOURCE.documentation,API],
    limitations:[
      'This counts redacted NFIP claim transactions within the stated state and loss years, not all flooding or damage.',
      'NFIP losses exclude uninsured properties, private insurance and other unreported loss.',
      'Claim counts are not unique structures, claim probability, or a property flood-loss history.',
      'OpenFEMA data can lag underlying federal records and can be corrected; retrieval date is not a publication date.',
      'Area-level paid amounts do not predict premiums, coverage, eligibility or future damage.'
    ],
    field_verification_required:true,
    parcel_claim_history:null,
    insurance_premium_estimate:null,
    insurance_eligibility_decision:null,
    site_suitability_verdict:null,
    request_persisted:false,
    publication_authority:false,
    decision_authority:false
  };
}
