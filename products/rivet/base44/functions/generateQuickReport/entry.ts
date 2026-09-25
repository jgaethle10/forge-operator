import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ALIEV_APP_ID='69b9b64d86a732029ce0db81';
const ALIEV_LOOKUP_URL='https://base44.app/api/apps/'+ALIEV_APP_ID+'/functions/energySiteLookup';
const OWNERS=new Set([
  'jessegaethle10@gmail.com','paola.verjan@gmail.com','daryl.wright0811@gmail.com',
  'mckaylastucker@gmail.com','by_romas@icloud.com','jochoa5111@gmail.com'
]);

function clean(v:any){return String(v??'').replace(/\s+/g,' ').trim()}
function normAddress(v:any){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
async function sha256Hex(v:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function publicText(v:any){return clean(v).replace(/\bAliEV\b/gi,'RIVET')}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
function arr(v:any){return Array.isArray(v)?v:[]}
function maxAadt(rows:any[]){return rows.length?Math.max(...rows.map(x=>n(x?.aadt)||0)):0}
function firstMessage(v:any){return publicText(v?.proxy?.message||v?.semantics||'')}
function refsFrom(v:any,out=new Set<string>(),depth=0){
  if(depth>8||v===null||v===undefined)return out;
  if(Array.isArray(v)){for(const x of v)refsFrom(x,out,depth+1);return out}
  if(typeof v!=='object')return out;
  for(const [k,val] of Object.entries(v)){
    if(typeof val==='string' && /(source_url|url)$/i.test(k) && /^https?:\/\//i.test(val))out.add(val);
    else if(typeof val==='object')refsFrom(val,out,depth+1);
  }
  return out;
}

async function pullAliEV(req:Request,address:string,paidPurchase:any=null,internalGrant:any=null){
  const auth=req.headers.get('authorization')||'';
  const headers:Record<string,string>={
    'Content-Type':'application/json',
    'Accept':'application/json',
    'X-App-Id':ALIEV_APP_ID,
    'X-RIVET-Source-App':'6ab2062323d5c33c7dde7606',
    'User-Agent':'RIVET-Reporting/1.0'
  };
  if(auth)headers['Authorization']=auth;
  if(internalGrant?.token&&internalGrant?.report_id){
    headers['X-RIVET-Internal-Grant']=clean(internalGrant.token);
    headers['X-RIVET-Report-Id']=clean(internalGrant.report_id);
  }
  if(paidPurchase){
    headers['X-RIVET-Report-Purchase-Key']=clean(paidPurchase.purchase_key);
    headers['X-RIVET-Report-Session-Id']=clean(paidPurchase.provider_checkout_session_id);
    headers['X-RIVET-Report-Offer-Key']=clean(paidPurchase.offer_key);
  }
  const response=await fetch(ALIEV_LOOKUP_URL,{
    method:'POST',
    headers,
    body:JSON.stringify({address})
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){ console.error('RIVET upstream report lookup failed',response.status,data); throw new Error('RIVET could not retrieve the report data for this site.'); }
  if(!data||data?.evidence_state==='PUBLIC_DISCOVERY_REDACTED'||data?.access_policy?.commercial_access!==true){
    throw new Error('Full report data was not authorized for this session, so RIVET did not build the report.');
  }
  return data;
}

function buildQuickRead(data:any){
  const traffic=arr(data?.traffic);
  const chargers=arr(data?.chargers);
  const incentives=data?.state==='NY'&&arr(data?.new_york_ev_programs).length?arr(data?.new_york_ev_programs):arr(data?.incentives);
  const salesAngles=arr(data?.sales_angles);
  const observedUsage=arr(data?.nearby_observed_usage);
  const max=maxAadt(traffic);
  const topTraffic=[...traffic].sort((a,b)=>(n(b?.aadt)||0)-(n(a?.aadt)||0))[0]||null;
  const chargerStatus=clean(data?.charger_source_status||'');
  const trafficStatus=clean(data?.traffic_source_status||'');
  const trafficLabel=max>=40000?'High':max>=20000?'Strong':max>0?'Observed':'Not verified';
  const strongest:string[]=[];
  const open:string[]=[];

  if(max>0){
    const road=[topTraffic?.road_name||topTraffic?.route,topTraffic?.location].filter(Boolean).join(' · ');
    strongest.push((max>=40000?'High':max>=20000?'Strong':'Verified')+' traffic exposure: '+max.toLocaleString()+' AADT'+(road?' at '+road:'')+'.');
  }
  if(chargerStatus && chargerStatus!=='unavailable' && chargers.length){
    const nearest=[...chargers].filter(x=>n(x?.distance_miles)!==null).sort((a,b)=>(n(a?.distance_miles)||999)-(n(b?.distance_miles)||999))[0];
    strongest.push(chargers.length.toLocaleString()+' nearby mapped public charging location'+(chargers.length===1?'':'s')+' in the verified screening context'+(nearest?.distance_miles!=null?', nearest '+Number(nearest.distance_miles).toFixed(1)+' mi away':'')+'.');
  }
  const utilityState=data?.coverage_contract?.utility_service_area?.state;
  const utilityTariffState=data?.coverage_contract?.utility_tariff?.state;
  if(utilityState && utilityState!=='NOT_OBSERVABLE')strongest.push('Source-backed utility service-area context is available for this site.');
  if(incentives.length)strongest.push(incentives.length+' incentive/program record'+(incentives.length===1?'':'s')+' surfaced for review.');
  if(observedUsage.length)strongest.push('Observed nearby charging-usage context is available for calibration.');
  if(salesAngles.length && strongest.length<4){
    const a=salesAngles[0];
    const label=clean(a?.title||a?.label||a?.angle||a?.name);
    if(label)strongest.push('Opportunity angle: '+label+'.');
  }

  if(!max){
    open.push(trafficStatus==='ok'
      ? 'No verified traffic count was returned for this screening run. Missing is not zero.'
      : 'Traffic evidence is not currently verified for this site.');
  }
  if(!chargers.length && (!chargerStatus || chargerStatus==='unavailable'))open.push('Nearby charging inventory could not be verified during this run.');
  if(!utilityState || utilityState==='NOT_OBSERVABLE')open.push(firstMessage(data?.coverage_contract?.utility_service_area)||'Serving utility still needs confirmation.');
  if(!utilityTariffState || utilityTariffState==='NOT_OBSERVABLE')open.push(firstMessage(data?.coverage_contract?.utility_tariff)||'Applicable tariff and interconnection still require confirmation.');
  const parcelState=data?.coverage_contract?.parcel_planning?.state;
  if(parcelState==='NOT_OBSERVABLE')open.push(firstMessage(data?.coverage_contract?.parcel_planning)||'Parcel/planning evidence is not yet verified.');
  open.push('Final site economics still require project-specific CAPEX, operating assumptions and approvals.');

  let decision_label='NOT YET · VERIFY';
  let decision_tone:'green'|'blue'|'amber'|'red'='amber';
  let decision_body='RIVET does not yet have enough verified screening evidence to recommend the next step.';
  if(max>=20000 && chargers.length){
    decision_label='YES · KEEP MOVING';
    decision_tone='green';
    decision_body='The verified traffic and charging-market context are strong enough for this site to earn the next step. This is not final investment approval.';
  }else if(max>0 || salesAngles.length || observedUsage.length){
    decision_label='YES · WORTH A CLOSER LOOK';
    decision_tone='blue';
    decision_body='The verified signals support continued review, while the open evidence gaps still control any final recommendation.';
  }

  const trafficSummary=max
    ? 'Highest verified nearby traffic count: '+max.toLocaleString()+' AADT'+(topTraffic?.reporting_year?' ('+topTraffic.reporting_year+')':'')+'. '+publicText(data?.traffic_source_name||topTraffic?.source||'Verified traffic source')+'.'
    : 'No verified AADT value was returned for this run. Missing evidence is not treated as zero.';

  const nearest=[...chargers].filter(x=>n(x?.distance_miles)!==null).sort((a,b)=>(n(a?.distance_miles)||999)-(n(b?.distance_miles)||999))[0]||null;
  const chargingSummary=chargers.length
    ? chargers.length.toLocaleString()+' mapped public charging location'+(chargers.length===1?'':'s')+' returned in the screening context'+(nearest?.distance_miles!=null?', with the nearest mapped location '+Number(nearest.distance_miles).toFixed(1)+' miles away':'')+'.'
    : 'No verified nearby public charging inventory was returned in this run. Missing inventory is not treated as zero.';
  const utilityCandidates=[...arr(data?.washington_utility_service_area_candidates),...arr(data?.california_utility_service_area_candidates)]
    .map((x:any)=>clean(x?.utility||x?.utility_name||x?.name||x?.acronym)).filter(Boolean);
  const utilitySummary=utilityState&&utilityState!=='NOT_OBSERVABLE'
    ? 'Utility service-area context is source-backed for this screening run'+(utilityCandidates.length?': '+[...new Set(utilityCandidates)].slice(0,3).join(', '):'.')
    : firstMessage(data?.coverage_contract?.utility_service_area)||'Serving utility remains unverified.';
  const tariffSummary=utilityTariffState&&utilityTariffState!=='NOT_OBSERVABLE'
    ? 'Tariff/interconnection context is present, but final rate assignment and available capacity still require project-specific utility confirmation.'
    : firstMessage(data?.coverage_contract?.utility_tariff)||'Applicable tariff and interconnection path remain unverified.';
  const incentiveSummary=incentives.length
    ? incentives.length+' incentive or program record'+(incentives.length===1?'':'s')+' surfaced for review. Eligibility, funding availability and award status must be confirmed against the underlying program.'
    : 'No verified incentive/program record was returned for this screening run.';
  const stock=data?.local_ev_stock||null;
  const stockTotal=n(stock?.total_ev_count);
  const marketSummary=stockTotal!==null
    ? 'Verified local EV-stock context: '+stockTotal.toLocaleString()+' vehicles for '+clean(stock?.geography_code||data?.postal_code||'the matched geography')+' at the recorded source vintage.'
    : observedUsage.length
      ? 'Observed charging-usage evidence exists near the site and is preserved separately from modeled demand.'
      : 'No local EV-stock or observed-usage quantity was verified for this run.';
  const propertySummary=parcelState&&parcelState!=='NOT_OBSERVABLE'
    ? 'Parcel/planning evidence is present for screening. It is not a survey, title opinion, permit approval or engineering determination.'
    : firstMessage(data?.coverage_contract?.parcel_planning)||'Parcel/planning evidence remains unverified for this site.';

  return {
    traffic,chargers,incentives,salesAngles,observedUsage,max,topTraffic,trafficLabel,
    strongest:strongest.slice(0,4),open:[...new Set(open.filter(Boolean))].slice(0,5),
    decision_label,decision_tone,decision_body,trafficSummary,chargingSummary,utilitySummary,tariffSummary,
    incentiveSummary,marketSummary,propertySummary
  };
}

function reportPackage(data:any,read:any){
  return {
    source_app:'RIVET intelligence source',
    source_app_id:ALIEV_APP_ID,
    retrieved_at:data?.retrieved_at||null,
    evidence_state:data?.evidence_state||null,
    matched_address:data?.matched_address||null,
    latitude:data?.latitude??null,
    longitude:data?.longitude??null,
    state:data?.state||null,
    postal_code:data?.postal_code||null,
    coverage_contract:data?.coverage_contract||null,
    traffic:{
      status:data?.traffic_source_status||null,
      name:data?.traffic_source_name||null,
      url:data?.traffic_source_url||null,
      radius_miles:data?.traffic_query_radius_miles??null,
      semantics:data?.traffic_semantics||null,
      rows:read.traffic.slice(0,25),
      profiles:arr(data?.traffic_profiles).slice(0,12),
      freight_context:data?.freight_context||null
    },
    charging:{
      status:data?.charger_source_status||null,
      name:data?.charger_source_name||null,
      license:data?.charger_source_license||null,
      nearby:read.chargers.slice(0,40),
      retail_benchmark:data?.zip_charging_price_benchmark||null,
      observed_usage:read.observedUsage.slice(0,20)
    },
    utility:{
      service_area:data?.coverage_contract?.utility_service_area||null,
      tariff:data?.coverage_contract?.utility_tariff||null,
      washington_candidates:arr(data?.washington_utility_service_area_candidates).slice(0,12),
      california_candidates:arr(data?.california_utility_service_area_candidates).slice(0,12),
      rate_candidates:arr(data?.utility_rate_candidates).slice(0,20),
      rate_candidate_utilities:arr(data?.utility_rate_candidate_utilities).slice(0,20),
      california_tariff_catalog:arr(data?.california_candidate_tariff_catalog).slice(0,12),
      pacific_power_current_rate_catalog:data?.washington_pacific_power_current_rate_catalog||null
    },
    programs:{
      incentives:read.incentives.slice(0,30),
      incentive_evidence:data?.incentive_evidence||null,
      new_york_program_status:data?.new_york_program_source_status||null
    },
    market:{
      local_ev_stock:data?.local_ev_stock||null,
      local_ev_stock_status:data?.local_ev_stock_status||null,
      california_county_charging_market:data?.california_county_charging_market||null,
      california_near_home_charging_gap:data?.california_near_home_charging_gap||null,
      dwell_anchors:arr(data?.dwell_anchors).slice(0,20)
    },
    property:{
      site_diligence:data?.site_diligence||null,
      parcel_planning:data?.california_parcel_planning||null,
      parcel_planning_status:data?.california_parcel_planning_status||null,
      tukwila_planning_risk:data?.tukwila_planning_risk||null
    },
    opportunity_angles:read.salesAngles.slice(0,12)
  };
}

Deno.serve(async(req)=>{
  const base44=createClientFromRequest(req);
  let report:any=null;
  try{
    if(req.method!=='POST')return Response.json({ok:false,error:'POST required'},{status:405});
    const me:any=await base44.auth.me().catch(()=>null);
    const email=clean(me?.email).toLowerCase();
    if(!me?.id)return Response.json({ok:false,error:'Authentication required'},{status:401});

    const body=await req.json().catch(()=>({}));
    const reportId=clean(body?.report_id).slice(0,180);
    if(!reportId)return Response.json({ok:false,error:'report_id required'},{status:400});
    report=await base44.entities.RIVETReport.get(reportId).catch(()=>null);
    if(!report)return Response.json({ok:false,error:'report not found'},{status:404});

    const ownerAccess=me?.role==='admin'||me?.rivet_owner===true||OWNERS.has(email);
    const customerAccess=Boolean(email)&&clean(report?.customer_email).toLowerCase()===email&&report?.payment_status==='paid'&&report?.customer_visible===true;
    if(!ownerAccess&&!customerAccess){
      return Response.json({ok:false,error:'RIVET report access required'},{status:403});
    }
    let paidPurchase:any=null;
    if(customerAccess&&!ownerAccess){
      const rows=await base44.asServiceRole.entities.RIVETPurchase.filter({purchase_key:clean(report.purchase_key)},'-updated_at',5).catch(()=>[]);
      paidPurchase=rows?.[0]||null;
      if(!paidPurchase||paidPurchase.status!=='paid'||!clean(paidPurchase.provider_checkout_session_id).startsWith('cs_')||paidPurchase.offer_key!=='rivet_report_495'){
        return Response.json({ok:false,error:'Verified RIVET report purchase required'},{status:403});
      }
    }

    const started=new Date().toISOString();
    const reportAddress=clean(report.address);
    const sourceGrantToken=crypto.randomUUID()+'.'+crypto.randomUUID();
    const sourceGrantExpiresAt=new Date(Date.now()+2*60*1000).toISOString();
    const sourceGrantHash=await sha256Hex(sourceGrantToken);
    const sourceGrantEnvelope=JSON.stringify({
      kind:'RIVET_SOURCE_GRANT_V1',
      hash:sourceGrantHash,
      expires_at:sourceGrantExpiresAt,
      purpose:'energy_site_lookup',
      address_norm:normAddress(reportAddress)
    });
    await base44.asServiceRole.entities.RIVETReport.update(reportId,{
      generation_state:'generating',
      aliev_source_status:'not_requested',
      source_notes:'Waiting for verified source intelligence.',
      aliev_report_data_json:sourceGrantEnvelope,
      updated_at:started
    });

    const data=await pullAliEV(req,reportAddress,paidPurchase,{token:sourceGrantToken,report_id:reportId});
    const read=buildQuickRead(data);
    const pack=reportPackage(data,read);
    const sourceRefs=[...refsFrom(pack)];
    const trafficRows=[...read.traffic].sort((a,b)=>(n(b?.aadt)||0)-(n(a?.aadt)||0)).slice(0,8);
    const generatedAt=new Date().toISOString();

    const sourceNotes=[
      'RIVET report data was built from source-backed intelligence for this exact address.',
      'RIVET does not independently invent traffic, charger, utility, incentive or market facts for this report.',
      'Verified, modeled and unknown evidence states remain separate.',
      'AADT is annual average daily traffic, not live congestion, footfall or charging sessions.',
      'A quick-report yes means deeper diligence is justified; it is not final engineering, underwriting or investment approval.'
    ].join(' ');

    const reportBody=[
      read.decision_label,
      read.decision_body,
      '',
      'Strongest points:',
      ...read.strongest.map((x:string)=>'• '+x),
      '',
      'Traffic:',
      read.trafficSummary,
      '',
      'Charging landscape:',
      read.chargingSummary,
      '',
      'Utility and tariff:',
      read.utilitySummary,
      read.tariffSummary,
      '',
      'Programs and incentives:',
      read.incentiveSummary,
      '',
      'Local market / demand evidence:',
      read.marketSummary,
      '',
      'Property and planning:',
      read.propertySummary,
      '',
      'Open questions:',
      ...read.open.map((x:string)=>'• '+x)
    ].join('\n');

    const update:any={
      address:data?.matched_address||report.address,
      latitude:n(data?.latitude),
      longitude:n(data?.longitude),
      state:clean(data?.state),
      postal_code:clean(data?.postal_code),
      status:(report?.payment_status==='paid'&&report?.customer_visible===true)?'ready':'qa',
      generation_state:'ready',
      generated_at:generatedAt,
      decision_label:read.decision_label,
      decision_body:read.decision_body,
      decision_tone:read.decision_tone,
      verdict:read.decision_label,
      executive_summary:read.decision_body,
      max_aadt:read.max||null,
      traffic_label:read.trafficLabel,
      traffic_source_name:publicText(data?.traffic_source_name),
      traffic_source_url:clean(data?.traffic_source_url),
      traffic_points_json:JSON.stringify(trafficRows),
      traffic_summary:read.trafficSummary,
      charger_count:read.chargers.length,
      charger_source_status:clean(data?.charger_source_status),
      strongest_points:read.strongest,
      top_drivers:read.strongest,
      open_questions:read.open,
      evidence_refs:sourceRefs,
      evidence_state:'SOURCE_BACKED_REPORT',
      source_notes:sourceNotes,
      report_body:reportBody,
      detailed_report_state:report.detailed_report_state||'not_requested',
      aliev_source_status:'ready',
      aliev_app_id:ALIEV_APP_ID,
      aliev_evidence_state:clean(data?.evidence_state),
      aliev_retrieved_at:clean(data?.retrieved_at||generatedAt),
      aliev_report_data_json:JSON.stringify(pack),
      aliev_source_refs:sourceRefs,
      updated_at:generatedAt
    };

    await base44.asServiceRole.entities.RIVETReport.update(reportId,update);
    return Response.json({ok:true,report_id:reportId});
  }catch(e){
    console.error('RIVET report generation failed',e);
    if(report?.id)try{
      await base44.asServiceRole.entities.RIVETReport.update(report.id,{
        generation_state:'failed',
        aliev_source_status:'failed',
        source_notes:'RIVET did not build the report because required source intelligence was unavailable or unauthorized.',
        aliev_report_data_json:'',
        updated_at:new Date().toISOString()
      });
    }catch{}
    return Response.json({ok:false,error:'RIVET could not build this report right now.'},{status:500});
  }
});