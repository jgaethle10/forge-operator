/** Read-only public WGS source and county-coverage receipt. NOT mineral suitability. */
import {writeFile} from 'node:fs/promises';
import {wgsEvidenceQuery,WGS_EVIDENCE_LAYERS} from './aggregate-evidence.mjs';

const county=process.env.EVERMAPS_COUNTY||'Grant';
const output=process.env.EVERMAPS_RECEIPT_FILE||'wgs-source-receipt.json';
const stamp=new Date().toISOString();
const receipt={
  schema:'evercraft.evermaps.wgs-source-canary.v2',observed_at:stamp,county,
  status:'unverified',datasets:{},scope:'read-only-count-and-county-coverage-probe',
  coverage_state:'unknown',
  warning:'A zero county count means no rows MATCH THE QUERY, not no aggregate resources or mining opportunities.'
};
async function read(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('HTTP '+response.status);
  const body=await response.json();
  if (body?.error) throw new Error(body.error.message||'ArcGIS source error');
  return body;
}
function sourceQuery(source,parameters) {
  const params=new URLSearchParams({...parameters,f:'json'});
  return source+'/query?'+params;
}
async function count(source,where) {
  const body=await read(sourceQuery(source,{where,returnCountOnly:'true'}));
  if (!Number.isSafeInteger(body?.count)||body.count<0) throw new Error('Unexpected WGS count response');
  return body.count;
}
for (const kind of Object.keys(WGS_EVIDENCE_LAYERS)) {
  const source=wgsEvidenceQuery({kind,county,countOnly:true}).split('/query?')[0];
  try {
    const countyCount=await count(source,"COUNTY='"+county+"'");
    const statewideCount=await count(source,'1=1');
    receipt.datasets[kind]={
      state:'verified_count',county_matching_rows:countyCount,
      statewide_published_rows:statewideCount,source
    };
  } catch(error) {
    receipt.datasets[kind]={state:'source_unreachable',reason:String(error?.message??error),source};
  }
}
for (const kind of ['resources','studies']) {
  if (receipt.datasets[kind]?.state!=='verified_count') continue;
  try {
    const source=receipt.datasets[kind].source;
    const query=sourceQuery(source,{where:'1=1',outFields:'COUNTY',
      returnDistinctValues:'true',returnGeometry:'false',orderByFields:'COUNTY ASC'});
    const body=await read(query);
    if (!Array.isArray(body?.features)) throw new Error('Unexpected county-list response');
    receipt.datasets[kind].publisher_county_values=[...new Set(body.features
      .map(row=>row?.attributes?.COUNTY).filter(v=>typeof v==='string'&&v.trim()))].sort();
    receipt.datasets[kind].county_value_matches_publisher=receipt.datasets[kind]
      .publisher_county_values.includes(county);
  } catch(error) {
    receipt.datasets[kind].county_list_state='unverified: '+String(error?.message??error);
  }
}
receipt.status=Object.values(receipt.datasets).every(v=>v.state==='verified_count')?
  'source_counts_verified':'source_probe_incomplete';
receipt.coverage_state=Object.values(receipt.datasets).some(v=>v.county_matching_rows>0)?
  'county_rows_observed':'no_county_rows_observed';
await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if (receipt.status!=='source_counts_verified') process.exitCode=1;
