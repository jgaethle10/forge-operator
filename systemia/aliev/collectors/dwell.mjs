import { ingestAliEvDomainRecords } from '../domain-store.mjs';

export const OVERPASS_ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const clean=(v)=>String(v??'').trim();
const num=(v)=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};

async function postOverpass(endpoint,query,{fetchImpl=fetch,timeoutMs=9000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(endpoint,{
      method:'POST',
      headers:{
        'user-agent':'Evercraft-AliEV/1.0 (destination dwell context)',
        accept:'application/json',
        'content-type':'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body:new URLSearchParams({data:query}),
      signal:controller.signal
    });
    if(!response.ok)throw new Error('http_'+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}

export async function collectUsDwellContext({
  stateDir,latitude,longitude,state='',fetchImpl=fetch,endpoints=OVERPASS_ENDPOINTS,retrievedAt=new Date().toISOString()
}={}){
  const lat=num(latitude),lon=num(longitude);
  if(lat===null||lon===null)throw new Error('coordinates_required');
  const query='[out:json][timeout:15];('+
    'nwr["tourism"="hotel"](around:5000,'+lat+','+lon+');'+
    'nwr["shop"~"^(mall|supermarket|department_store)$"](around:5000,'+lat+','+lon+');'+
    'nwr["amenity"~"^(restaurant|cafe|fast_food|hospital|university|college|cinema|conference_centre)$"](around:5000,'+lat+','+lon+');'+
    'nwr["leisure"~"^(park|fitness_centre|sports_centre)$"](around:5000,'+lat+','+lon+');'+
    'nwr["aeroway"="aerodrome"](around:12000,'+lat+','+lon+');'+
    ');out center tags;';
  let body=null,selected='',lastError='';
  for(const endpoint of endpoints){
    try{
      body=await postOverpass(endpoint,query,{fetchImpl});
      selected=endpoint;
      break;
    }catch(error){lastError=error instanceof Error?error.message:String(error);}
  }
  if(!body){
    return {
      schema:'evercraft.aliev.collector-receipt.v1',
      collector:'us_osm_dwell_context',
      source_status:'unavailable',
      records:0,
      error:lastError||'all_overpass_endpoints_failed',
      attempted_endpoints:endpoints.length,
      retrieved_at:retrievedAt
    };
  }
  const seen=new Set();
  const records=(body?.elements||[]).map((element)=>{
    const tags=element?.tags||{},center=element?.center||{};
    const rlat=num(element?.lat??center.lat),rlon=num(element?.lon??center.lon);
    if(rlat===null||rlon===null)return null;
    const category=clean(tags.tourism||tags.shop||tags.amenity||tags.leisure||tags.aeroway)||'destination';
    const sourceId='osm-dwell:'+clean(element?.type)+':'+clean(element?.id);
    if(seen.has(sourceId))return null;
    seen.add(sourceId);
    return {
      record_key:sourceId,
      source_id:sourceId,
      name:clean(tags.name||tags.brand)||category,
      category,
      latitude:rlat,longitude:rlon,state:clean(state).toUpperCase()||null,
      source_name:'OpenStreetMap / Overpass',
      source_url:'https://www.openstreetmap.org/'+clean(element?.type)+'/'+clean(element?.id),
      source_retrieved_at:retrievedAt,
      evidence_state:'PUBLIC_PROXY',
      data_status:'imported',
      semantics:'Mapped destination context from OpenStreetMap. Presence is a dwell-context proxy, not foot traffic, visitation, charging demand, customer conversion or utilization.'
    };
  }).filter(Boolean).slice(0,160);
  const receipt=ingestAliEvDomainRecords({
    stateDir,domain:'dwell_context',records,
    source:{name:'OpenStreetMap / Overpass',url:selected,retrieved_at:retrievedAt,evidence_state:'PUBLIC_PROXY',data_status:'imported'}
  });
  return {
    schema:'evercraft.aliev.collector-receipt.v1',
    collector:'us_osm_dwell_context',
    source_status:records.length?'connected':'empty',
    records:records.length,
    selected_endpoint:selected,
    attempted_endpoints:endpoints.length,
    ingest:receipt,
    retrieved_at:retrievedAt
  };
}
