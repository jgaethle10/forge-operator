// Official U.S. Drought Monitor / NDMC county percent-area statistics, read only.
// County drought assessments are REPORTED contextual evidence. Never a parcel, soil,
// water-right, irrigation-allocation, or site-suitability finding.
const API='https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent';
export const USDM_COUNTY_PROFILES=Object.freeze({
  '53077':{label:'Yakima County',state:'WA',region_key:'Yakima County, Washington',region_group:'yakima-wa'},
  '53005':{label:'Benton County',state:'WA',region_key:'Benton County, Washington',region_group:'tri-cities-wa'},
  '53021':{label:'Franklin County',state:'WA',region_key:'Franklin County, Washington',region_group:'tri-cities-wa'}
});
const sleepNotNeeded=undefined; // Keep calls bounded, deterministic and synchronous to the run.

function dateOnly(value){
  const str=String(value??'').trim();
  const match=/^(\d{4})(\d{2})(\d{2})$/.exec(str) ||
    /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(str);
  if(!match)throw new Error('usdm_map_date_invalid');
  const [_,y,m,d]=match;
  const result=new Date(y+'-'+m+'-'+d+'T12:00:00.000Z');
  if(!Number.isFinite(result.getTime())||result.toISOString().slice(0,10)!==y+'-'+m+'-'+d){
    throw new Error('usdm_map_date_invalid');
  }
  return result;
}
function usdmDateUTC(date) {
  const d=new Date(date);
  return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'/'+d.getUTCFullYear();
}
function asNumber(value,label){
  if(value===null||value===undefined||String(value).trim()==='')throw new Error('usdm_missing_'+label);
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>100)throw new Error('usdm_invalid_'+label);
  return n;
}
function parseCsv(csv){
  const lines=String(csv||'').trim().split(/\r?\n/).filter(Boolean);
  if(lines.length<2)return [];
  // Official NDMC CSV contains simple numeric/date/text columns; refuse quoted commas
  // rather than silently shifting FIPS or drought percentage columns.
  const headers=lines.shift().replace(/^\uFEFF/,'').split(',').map((x)=>x.trim().replace(/^"|"$/g,''));
  const rows=[];
  for(const line of lines.slice(0,40)){
    const values=line.split(',');
    if(values.length!==headers.length)throw new Error('usdm_csv_schema_mismatch');
    rows.push(Object.fromEntries(headers.map((key,i)=>[key,values[i]?.trim().replace(/^"|"$/g,'')])));
  }
  return rows;
}
function parsePayload(body){
  const text=String(body||'').trim();
  if(!text||text.length>200_000)throw new Error('usdm_payload_missing_or_oversized');
  let parsed;
  if(text.startsWith('[')||text.startsWith('{')){
    parsed=JSON.parse(text);
    if(Array.isArray(parsed))return parsed;
    if(Array.isArray(parsed.data))return parsed.data;
    if(Array.isArray(parsed.results))return parsed.results;
    throw new Error('usdm_json_schema_mismatch');
  }
  return parseCsv(text);
}
export function normalizeUsdmCountyRows(rows,{fips,checkedAt,sourceUrl}){
  const profile=USDM_COUNTY_PROFILES[String(fips)];
  if(!profile)throw new Error('usdm_unknown_county_fips');
  const now=new Date(checkedAt);
  if(!Number.isFinite(now.getTime()))throw new Error('usdm_invalid_checked_at');
  const matches=(Array.isArray(rows)?rows:[]).filter((row)=>{
    const rowFips=String(row?.FIPS??row?.fips??'').trim().padStart(5,'0');
    return rowFips===String(fips);
  });
  if(!matches.length)throw new Error('usdm_county_not_in_response');
  const dated=matches.map((row)=>({row,date:dateOnly(row.MapDate??row.mapDate)}))
    .sort((a,b)=>b.date.getTime()-a.date.getTime());
  const latest=dated[0],ageDays=(now.getTime()-latest.date.getTime())/86400000;
  if(ageDays< -2 || ageDays> 21)throw new Error('usdm_stale_or_future_map');
  const values=Object.fromEntries(['None','D0','D1','D2','D3','D4'].map((key)=>[
    key,asNumber(latest.row[key]??latest.row[key.toLowerCase()],key)
  ]));
  if(values.D0+values.None>100.5||values.D0+values.None<99.5){
    throw new Error('usdm_none_d0_sum_invalid');
  }
  for(const [hi,lo] of [['D0','D1'],['D1','D2'],['D2','D3'],['D3','D4']]){
    if(values[hi]+0.01<values[lo])throw new Error('usdm_cumulative_levels_invalid');
  }
  const mapDate=latest.date.toISOString().slice(0,10);
  const percent=(key)=>String(Number(values[key].toFixed(2)));
  return {
    observation_id:'usdm-county-percent-area:'+String(fips)+':'+mapDate,
    created_at:latest.date.toISOString(),
    region_key:profile.region_key,
    region_group:profile.region_group,
    source_family:'us-drought-monitor-ndmc',
    independence_group:'ndmc-usda-noaa-usdm',
    domain:'environmental',
    kind:'usdm_county_weekly_drought_assessment',
    evidence_state:'reported',
    reliability:0.87,
    anomaly_score:Math.min(1,Math.max(0,values.D1/100)),
    hazard_state:'unknown',
    // Cumulative traditional format: D1 is D1-or-worse, NOT category D1 alone.
    summary:'U.S. Drought Monitor weekly county drought assessment for '+profile.label+
      ', '+profile.state+' (map valid '+mapDate+'): '+percent('D0')+
      '% of county area abnormally dry or worse (D0+); '+percent('D1')+
      '% moderate drought or worse (D1+); '+percent('D2')+
      '% severe drought or worse (D2+). This county-scale climate resilience indicator does not establish site water rights, soil condition, or irrigation reliability.',
    provenance_ref:sourceUrl,
    metric_value:values.D1,
    metric_metadata:{
      source:'U.S. Drought Monitor NDMC/USDA/NOAA',
      scale:'county',
      county_fips:String(fips),
      map_date:mapDate,
      data_format:'traditional_cumulative_percent_area',
      none_percent:values.None,
      d0_or_worse_percent:values.D0,
      d1_or_worse_percent:values.D1,
      d2_or_worse_percent:values.D2,
      d3_or_worse_percent:values.D3,
      d4_or_worse_percent:values.D4,
      site_decision_authority:false
    },
    adapter_receipt:{
      source_id:'usdm-county-weekly',
      source_url:sourceUrl,
      county_fips:String(fips),
      map_date:mapDate,
      method:'official_rest_county_percent_area_statistics',
      original_evidence_state:'reported',
      read_only:true
    }
  };
}
export async function pollUsdmCountyDrought({
  countyFips=['53077'],
  checkedAt=new Date().toISOString(),
  fetchImpl=globalThis.fetch
}={}){
  const fipsList=[...new Set(countyFips.map(String))];
  if(!fipsList.length||fipsList.length>3||fipsList.some((x)=>!USDM_COUNTY_PROFILES[x])){
    throw new Error('usdm_county_list_not_authorized');
  }
  const now=new Date(checkedAt);
  const start=new Date(now.getTime()-28*86400000);
  const observations=[],failures=[],queryUrls=[];
  for(const fips of fipsList){
    const url=new URL(API);
    url.searchParams.set('aoi',fips);
    url.searchParams.set('startdate',usdmDateUTC(start));
    url.searchParams.set('enddate',usdmDateUTC(now));
    url.searchParams.set('statisticsType','1');
    const sourceUrl=url.toString();
    queryUrls.push(sourceUrl);
    try{
      const response=await fetchImpl(sourceUrl,{
        headers:{Accept:'application/json','User-Agent':'Evercraft-FAIE/1.0 (public evidence collector)'},
        signal:AbortSignal.timeout(9000)
      });
      if(!response.ok)throw new Error('usdm_http_'+response.status);
      const body=await response.text();
      const parsed=parsePayload(body);
      observations.push(normalizeUsdmCountyRows(parsed,{fips,checkedAt,sourceUrl}));
    }catch(error){
      failures.push({fips,error:error instanceof Error?error.message:String(error)});
    }
  }
  return {
    observations,
    receipt:{
      source_id:'usdm-county-weekly',
      status:failures.length ? (observations.length?'partial':'error') : 'ok',
      checked_at:checkedAt,
      item_count:observations.length,
      county_fips_requested:fipsList,
      failures,
      source_urls:queryUrls,
      publication_authority:false,
      decision_authority:false
    }
  };
}
