/** Bounded, read-only real-geometry probe for a WGS-covered county. */
import {writeFile} from 'node:fs/promises';
import {WGS_EVIDENCE_LAYERS,wgsEvidenceQuery} from './aggregate-evidence.mjs';

const county=process.env.EVERMAPS_COUNTY||'Grant';
const receipt={
  schema:'evercraft.evermaps.wgs-feature-sample.v1',
  observed_at:new Date().toISOString(),county,
  status:'unverified',samples:{},
  sample_limit_per_layer:2,complete_source_inventory:false,
  warning:'FIRST RECORDS ONLY. Not a site selection or full GIS ingestion.'
};
const out={type:'FeatureCollection',name:'WGS polygon geometry sample, not a resource or prospect recommendation',features:[]};
const fetchJSON=async(url)=>{
  const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if (!res.ok) throw new Error('HTTP '+res.status);
  const body=await res.json();
  if (body?.error) throw new Error(body.error.message||'ArcGIS error');
  return body;
};
for (const [kind,layer] of Object.entries(WGS_EVIDENCE_LAYERS)) {
  try {
    const count=await fetchJSON(wgsEvidenceQuery({kind,county,countOnly:true}));
    if (!Number.isSafeInteger(count?.count)||count.count<0) throw new Error('Invalid source count');
    if (count.count===0) {
      receipt.samples[kind]={state:'no_matching_rows',county_count:0};
      continue;
    }
    const payload=await fetchJSON(wgsEvidenceQuery({kind,county,pageSize:2}));
    if (payload?.type!=='FeatureCollection'||!Array.isArray(payload.features)||
        payload.features.length<1||payload.features.length>2) throw new Error('Unexpected GeoJSON payload');
    for (const row of payload.features) {
      if (!layer.geometry.includes(row?.geometry?.type)||!Array.isArray(row.geometry.coordinates)||
          !Number.isSafeInteger(row?.properties?.OBJECTID)) throw new Error('Invalid geometry or source identifier');
      if (!layer.fields.every(field=>Object.hasOwn(row.properties,field))) {
        throw new Error('Expected published field not present');
      }
    }
    receipt.samples[kind]={
      state:'geojson_sample_verified',county_count:count.count,
      features_sampled:payload.features.length,geometry_types:[...new Set(payload.features.map(f=>f.geometry.type))],
      identifiers:payload.features.map(f=>f.properties.OBJECTID),
      source:wgsEvidenceQuery({kind,county,pageSize:2}).split('/query?')[0]
    };
    if (kind==='resources') out.features=payload.features;
  } catch(error) {
    receipt.samples[kind]={state:'feature_sample_unverified',reason:String(error?.message??error)};
  }
}
receipt.status=Object.values(receipt.samples).every(s=>s.state==='geojson_sample_verified')?
  'four_layer_sample_verified':'sample_incomplete';
await writeFile('wgs-feature-sample-receipt.json',JSON.stringify(receipt,null,2)+'\n');
await writeFile('wgs-resource-sample.geojson',JSON.stringify(out)+'\n');
console.log(JSON.stringify(receipt,null,2));
if (receipt.status!=='four_layer_sample_verified') process.exitCode=1;
