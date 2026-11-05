/**
 * Compare PUBLIC WA DNR permit-point endpoints without downloading owner data.
 * Discovery is separate from complete permit import; no automatic source switch.
 */
const FIELDS=['OBJECTID','MINE_PERMIT_NUMBER','COUNTY_NAME','COMMODITY_DESC'];
export const WA_PERMIT_SOURCE_CANDIDATES=Object.freeze([
 {key:'site3_current',url:'https://gis.dnr.wa.gov/site3/rest/services/Geology/Active_Surface_Mine_Permit_Sites/MapServer/1'},
 {key:'site3_feature',url:'https://gis.dnr.wa.gov/site3/rest/services/Geology/Active_Surface_Mine_Permit_Sites/FeatureServer/1'},
 {key:'site1_legacy',url:'https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0'}
]);
async function read(url,fetchImpl,signal){
 const r=await fetchImpl(url,{signal,headers:{accept:'application/json,application/geo+json'}});
 if(!r?.ok)throw Error('HTTP '+(r?.status??'unknown'));
 const j=await r.json();
 if(!j||typeof j!=='object'||Array.isArray(j))throw Error('Invalid ArcGIS JSON');
 if(j.error)throw Error('ArcGIS '+(j.error.code??'error')+': '+String(j.error.message??'unknown').slice(0,100));
 return j;
}
export function permitReadOnlyQuery(base,{type='count'}={}){
 const params=new URLSearchParams({
  f:type==='sample'?'geojson':'json',
  where:"COUNTY_NAME='Grant'"
 });
 if(type==='sample'){
  params.set('outFields',FIELDS.join(','));params.set('returnGeometry','true');
  params.set('outSR','4326');params.set('orderByFields','OBJECTID ASC');
  params.set('resultOffset','0');params.set('resultRecordCount','1');
 }else if(type==='count')params.set('returnCountOnly','true');
 else throw Error('Unsupported probe');
 return base+'/query?'+params;
}
export async function probeWaPermitSourceCandidates({
 fetchImpl=fetch,signal=AbortSignal.timeout(50000),
 now=()=>new Date().toISOString(),candidates=WA_PERMIT_SOURCE_CANDIDATES
}={}){
 const rows=[];
 for(const c of candidates){
  let schemaDiagnostic=null;
  try{
   const u=new URL(c.url);
   if(u.protocol!=='https:'||u.hostname!=='gis.dnr.wa.gov')
    throw Error('Source must be official WA DNR HTTPS');
   const meta=await read(c.url+'?f=json',fetchImpl,signal);
   // Diagnostic exposes public schema names only, never applicant/owner records.
   const names=Array.isArray(meta.fields)?meta.fields.map(f=>f.name).filter(x=>typeof x==='string'):[];
   schemaDiagnostic={
    geometry_type:meta.geometryType??null,
    missing_expected_fields:FIELDS.filter(name=>!names.includes(name)),
    observed_nonpersonal_field_names:names.filter(name=>!/name|owner|applicant|address|phone|email|contact|permittee/i.test(name)).slice(0,45),
    total_metadata_field_count:names.length
   };
   if(meta.geometryType!=='esriGeometryPoint'||!Array.isArray(meta.fields)||
      !FIELDS.every(name=>meta.fields.some(f=>f.name===name))){
    throw Error('Metadata schema/geometry not compatible with non-owner importer');
   }
   const cnt=await read(permitReadOnlyQuery(c.url,{type:'count'}),fetchImpl,signal);
   if(!Number.isSafeInteger(cnt.count)||cnt.count<0)throw Error('County count unavailable');
   let sampleState='no_rows_to_sample';
   if(cnt.count>0){
    const s=await read(permitReadOnlyQuery(c.url,{type:'sample'}),fetchImpl,signal);
    if(s.type!=='FeatureCollection'||!Array.isArray(s.features)||
       s.features.length!==1||s.features[0]?.geometry?.type!=='Point'||
       !FIELDS.every(name=>Object.hasOwn(s.features[0]?.properties??{},name))||
       s.features[0].properties.COUNTY_NAME!=='Grant'||
       !Array.isArray(s.features[0].geometry.coordinates)||
       !s.features[0].geometry.coordinates.slice(0,2).every(Number.isFinite)){
      throw Error('GeoJSON sample not compatible with bounded source importer');
    }
    sampleState='one_non_owner_point_geometry_verified';
   }
   rows.push({
    key:c.key,source:c.url,state:'read_only_count_and_geometry_sample_verified',
    county_count:cnt.count,sample_state:sampleState,owner_fields_requested:false,
    observed_at:now()
   });
  }catch(e){
   rows.push({key:c.key,source:c.url,state:'source_unverified',
    county_count:null,reason:String(e?.message??e),
    schema_diagnostic:schemaDiagnostic,owner_fields_requested:false});
  }
 }
 return {schema:'evercraft.evermaps.wa-permit-source-discovery.v1',observed_at:now(),
  state:rows.some(r=>r.state==='read_only_count_and_geometry_sample_verified')?
   'at_least_one_source_verified':'no_live_permit_source_verified',
  preferred_source_key:rows.find(r=>r.state==='read_only_count_and_geometry_sample_verified')?.key??null,
  results:rows,full_county_import_verified:false,current_operating_status_verified:false,
  land_title_verified:false,permittee_records_exported:false,
  note:'Official source reachability, Grant county count and one non-owner GeoJSON point only. No full import, legal title or active mining claim.'
 };
}
