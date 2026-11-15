// Source-reviewed NRCS index history. The staged runs are NOT permanent ledger history.
export const INDEX_REVIEW_PATH='./data/nrcs-index-review-2026-11-11-to-15.json';
export const INDEX_REVIEW_SCHEMA='evercraft.watershed.staged-index-history.v1';
const ids=['upper-yakima','naches','lower-yakima'];
const sha=/^[a-f0-9]{64}$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
const run=/^[1-9][0-9]{4,17}$/;
const exactRunUrl=(url,id)=>{
  try{
    const u=new URL(url);
    return u.protocol==='https:'&&u.hostname==='github.com'&&
      u.pathname==='/jgaethle10/forge-operator/actions/runs/'+id&&!u.search&&!u.hash;
  }catch{return false}
};
function validDate(v){
  if(typeof v!=='string'||!date.test(v))return false;
  const ms=Date.parse(v+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===v;
}
export function validateIndexReview(v){
  const errors=[];
  if(v?.schema!==INDEX_REVIEW_SCHEMA||v?.presentation!=='INTERNAL_SOURCE_REVIEW_ONLY'||
     v?.live_feed!==false||v?.human_publication_approved!==false||
     v?.water_supply_forecast_authorized!==false||
     v?.percent_reservoir_capacity_authorized!==false||
     v?.reservoir_history_calculated!==false)
    errors.push('authority_contract');
  if(v?.baseline!=='1991-2020'||v?.sourced_as_of!=='2026-11-15'||
     typeof v?.official_warning!=='string'||!v.official_warning.includes('NRCS'))
    errors.push('baseline_or_warning');
  const days=v?.days;
  if(!Array.isArray(days)||days.length!==5)errors.push('coverage_count');
  else{
    const seen=new Set();
    for(const [i,d] of days.entries()){
      const expectedDay='2026-11-'+String(11+i).padStart(2,'0');
      if(!validDate(d.date)||d.date!==expectedDay||seen.has(d.date))
        errors.push('unreconciled_source_day');
      seen.add(d.date);
      if(!run.test(d.source_run_id)||!exactRunUrl(d.source_run_url,d.source_run_id)||
         !sha.test(d.source_report_sha256)||d.source_receipts_verified!==true)
        errors.push('unverified_source_receipt');
      const inLedger=i===0;
      if(d.preservation!==(inLedger?'ledger_recorded':'temporary_staged')||
         (inLedger?d.staging_run_url!==null:!d.staging_run_url)||
         (!inLedger&&!exactRunUrl(d.staging_run_url,d.staging_run_url?.split('/').at(-1)))||
         d.reservoir_comparable_sum_af!==null||
         !Number.isInteger(d.reservoir_reported_site_count)||d.reservoir_reported_site_count<0||
         d.reservoir_reported_site_count>5)
        errors.push('durability_or_reservoir_claim');
      if(!Array.isArray(d.indices)||d.indices.length!==3||
         ids.some(id=>d.indices.filter(x=>x.id===id).length!==1)||
         !d.indices.every(x=>Number.isFinite(x.percent)&&x.percent>=0&&x.percent<=10000&&
         x.nrcs_warning===true))
        errors.push('official_basin_warning_or_index');
    }
  }
  return {valid:errors.length===0,errors:[...new Set(errors)]};
}
export function indexReviewCounts(v){
  const audit=validateIndexReview(v);
  if(!audit.valid)throw new TypeError('cannot summarize unverified index review: '+audit.errors.join(','));
  return {
    days:v.days.length,
    durable_days:v.days.filter(d=>d.preservation==='ledger_recorded').length,
    temporary_days:v.days.filter(d=>d.preservation==='temporary_staged').length,
    warned_indices:v.days.reduce((sum,d)=>sum+d.indices.filter(x=>x.nrcs_warning).length,0),
    reservoir_trend_available:false,
    safe_for_forecasting:false
  };
}
