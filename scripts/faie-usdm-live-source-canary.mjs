#!/usr/bin/env node
// Live independent NDMC source smoke. No user data, private systems or data writes.
import { createHash } from 'node:crypto';
import { pollUsdmCountyDrought } from '../systemia/faie/usdm-source.mjs';

const receipt={
  schema:'evercraft.faie.usdm-official-source-live.v1',
  checked_at:new Date().toISOString(),
  state:'SOURCE_HOLD',
  verified:false,
  source:'https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent',
  counties_requested:['53077','53005','53021'],
  decision_authority:false,
  publication_authority:false
};
try{
  const result=await pollUsdmCountyDrought({countyFips:receipt.counties_requested,checkedAt:receipt.checked_at});
  receipt.source_receipt=result.receipt;
  receipt.observations=result.observations.map((row)=>({
    county_fips:row.metric_metadata?.county_fips,
    source_family:row.source_family,
    region_key:row.region_group,
    map_date:row.metric_metadata?.map_date,
    evidence_state:row.evidence_state,
    source_url:row.provenance_ref,
    d1_or_worse_percent:row.metric_metadata?.d1_or_worse_percent
  }));
  if(result.receipt.status!=='ok'||result.observations.length!==3){
    throw new Error('official_county_coverage_incomplete_or_provider_unavailable');
  }
  for(const row of result.observations){
    if(row.evidence_state!=='reported'||!row.provenance_ref.startsWith('https://usdmdataservices.unl.edu/api/')){
      throw new Error('provenance_or_evidence_ceiling_invalid');
    }
  }
  if(result.observations.filter((row)=>row.region_group==='tri-cities-wa').length!==2){
    throw new Error('tri_cities_county_mapping_invalid');
  }
  receipt.verified=true;
  receipt.state='OFFICIAL_SOURCE_VERIFIED';
}catch(error){
  receipt.error=error instanceof Error?error.message:String(error);
  process.exitCode=1;
}
receipt.receipt_sha256=createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
