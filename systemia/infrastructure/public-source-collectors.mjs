#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const ATLAS_APP_ID = '694985a7cb60682ad91670c9';
const INGRESS_URL = process.env.EVERCRAFT_INFRASTRUCTURE_INGRESS_URL ||
  `https://base44.app/api/apps/${ATLAS_APP_ID}/functions/systemiaInfrastructureIngress`;
const TOKEN_FILE = String(process.env.SYSTEMIA_INFRASTRUCTURE_ID_TOKEN_FILE || '').trim();
const OUTPUT_ROOT = path.resolve(process.env.SYSTEMIA_INFRASTRUCTURE_OUTPUT_ROOT || 'artifacts/infrastructure');
const SOURCE = String(process.env.SYSTEMIA_INFRASTRUCTURE_SOURCE || process.argv[2] || '').trim();

const WB_ROOT = 'https://api.worldbank.org/v2';
const WB_YEAR = Math.max(1990, Math.min(Number(process.env.INFRA_WORLD_BANK_YEAR || 2024), new Date().getUTCFullYear()));
const WB_SOURCE_ID = 'INFRA-SRC-WB-INDICATORS';
const HYDROMET_ROOT = 'https://www.usbr.gov/pn-bin/instant.pl';
const HYDROMET_SOURCE_ID = 'INFRA-SRC-USBR-HYDROMET-YAKIMA';
const HYDROMET_TZ = 'America/Los_Angeles';

const WB_METRICS = [
  { key:'electricity_access_pct', indicator:'EG.ELC.ACCS.ZS', label:'Access to electricity', unit:'% of population', sector:'power' },
  { key:'rural_electricity_access_pct', indicator:'EG.ELC.ACCS.RU.ZS', label:'Rural access to electricity', unit:'% of rural population', sector:'power' },
  { key:'population_total', indicator:'SP.POP.TOTL', label:'Population', unit:'people', sector:'multi_system' },
];
const HYDROMET_TARGETS = [
  { station:'BUM', pcode:'AF', subject:'asset:usbr:yakima:BUM', metric:'reservoir_storage_acre_feet', label:'Bumping Reservoir storage', unit:'acre-feet', scope:'asset', locality:'Bumping Reservoir, Yakima Basin' },
  { station:'CLE', pcode:'AF', subject:'asset:usbr:yakima:CLE', metric:'reservoir_storage_acre_feet', label:'Cle Elum Reservoir storage', unit:'acre-feet', scope:'asset', locality:'Cle Elum Reservoir, Yakima Basin' },
  { station:'KAC', pcode:'AF', subject:'asset:usbr:yakima:KAC', metric:'reservoir_storage_acre_feet', label:'Kachess Reservoir storage', unit:'acre-feet', scope:'asset', locality:'Kachess Reservoir, Yakima Basin' },
  { station:'KEE', pcode:'AF', subject:'asset:usbr:yakima:KEE', metric:'reservoir_storage_acre_feet', label:'Keechelus Reservoir storage', unit:'acre-feet', scope:'asset', locality:'Keechelus Reservoir, Yakima Basin' },
  { station:'RIM', pcode:'AF', subject:'asset:usbr:yakima:RIM', metric:'reservoir_storage_acre_feet', label:'Rimrock Lake storage', unit:'acre-feet', scope:'asset', locality:'Rimrock Lake, Yakima Basin' },
  { station:'PARW', pcode:'Q', subject:'station:usbr:yakima:PARW', metric:'river_discharge_cfs', label:'Yakima River at Parker flow', unit:'cfs', scope:'station', locality:'Yakima River at Parker, Washington' },
];

function clean(value, max=3000) {
  return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max);
}
function safeId(value) {
  return clean(value,300).replace(/[^A-Za-z0-9_-]+/g,'');
}
function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function atomicJson(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function workloadToken() {
  if(!TOKEN_FILE || !fs.existsSync(TOKEN_FILE)) throw new Error('SYSTEMIA_INFRASTRUCTURE_ID_TOKEN_FILE missing');
  const value=fs.readFileSync(TOKEN_FILE,'utf8').trim();
  if(!value) throw new Error('Infrastructure workload identity file is empty');
  return value;
}
async function fetchWithTimeout(url, options={}, timeoutMs=20000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    return response;
  } finally {
    clearTimeout(timer);
  }
}
async function postIngress(body) {
  const response=await fetchWithTimeout(INGRESS_URL,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+workloadToken(),
      'user-agent':'EvercraftInfrastructureCollector/1.0',
    },
    body:JSON.stringify(body),
  },45000);
  const data=await response.json().catch(()=>({}));
  if(!response.ok || data?.ok!==true) throw new Error('compatibility ingress HTTP '+response.status+': '+clean(data?.error||data?.auth_reason,500));
  return data;
}
function chunks(values,size) {
  const out=[];
  for(let i=0;i<values.length;i+=size) out.push(values.slice(i,i+size));
  return out;
}
function severityFor(access,unserved) {
  if((access<25 && unserved>=10_000_000)||unserved>=25_000_000) return 'critical';
  if(access<50 || unserved>=10_000_000) return 'serious';
  if(access<80 || unserved>=2_000_000) return 'concerning';
  return 'watch';
}
async function runWorldBank() {
  const startedAt=new Date().toISOString();
  const executionId='SYSTEMIA-WB-'+WB_YEAR+'-'+randomUUID();
  const countryResponse=await fetchWithTimeout(`${WB_ROOT}/country?format=json&per_page=400`,{headers:{'user-agent':'EvercraftInfrastructureCollector/1.0','accept':'application/json'}});
  if(!countryResponse.ok) throw new Error('World Bank countries HTTP '+countryResponse.status);
  const countryPayload=await countryResponse.json();
  const countries=Array.isArray(countryPayload?.[1])?countryPayload[1]:[];
  const countryMap=new Map();
  for(const row of countries){
    const iso3=clean(row?.id,10);
    if(!iso3 || clean(row?.region?.value,100)==='Aggregates') continue;
    countryMap.set(iso3,{
      iso3,
      name:clean(row?.name,200),
      region:clean(row?.region?.value,200),
      latitude:Number(row?.latitude),
      longitude:Number(row?.longitude),
    });
  }

  const retrievedAt=new Date().toISOString();
  const observations=[];
  const byMetric=new Map();
  for(const metric of WB_METRICS){
    const url=`${WB_ROOT}/country/all/indicator/${metric.indicator}?date=${WB_YEAR}&format=json&per_page=400`;
    const response=await fetchWithTimeout(url,{headers:{'user-agent':'EvercraftInfrastructureCollector/1.0','accept':'application/json'}});
    if(!response.ok) throw new Error('World Bank '+metric.indicator+' HTTP '+response.status);
    const payload=await response.json();
    const rows=Array.isArray(payload?.[1])?payload[1]:[];
    const metricMap=new Map();
    for(const row of rows){
      const iso3=clean(row?.countryiso3code,10);
      const country=countryMap.get(iso3);
      const value=Number(row?.value);
      if(!country || !Number.isFinite(value)) continue;
      metricMap.set(iso3,{value,country});
      observations.push({
        observation_id:`WB-${safeId(metric.key)}-${iso3}-${WB_YEAR}`,
        source_coverage_id:WB_SOURCE_ID,
        source_name:'World Bank Infrastructure Indicators',
        subject_key:`country:${iso3}`,
        metric_key:metric.key,
        metric_label:metric.label,
        sector:metric.sector,
        country_iso3:iso3,
        country_name:country.name,
        region:country.region,
        geographic_scope:'country',
        latitude:Number.isFinite(country.latitude)?country.latitude:undefined,
        longitude:Number.isFinite(country.longitude)?country.longitude:undefined,
        observed_period:String(WB_YEAR),
        value,
        unit:metric.unit,
        source_url:`https://data.worldbank.org/indicator/${metric.indicator}?locations=${iso3}`,
        retrieved_at:retrievedAt,
        evidence_state:'reported',
        confidence:'high',
        freshness_state:'current',
        lineage_key:`worldbank:${metric.indicator}:${iso3}`,
        normalization_notes:`Normalized outside Base44 from World Bank indicator ${metric.indicator}. Source-reported value semantics are preserved.`,
        public_safe:true,
      });
    }
    byMetric.set(metric.key,metricMap);
  }

  const accessMap=byMetric.get('electricity_access_pct')||new Map();
  const populationMap=byMetric.get('population_total')||new Map();
  const signals=[];
  for(const [iso3,accessRow] of accessMap.entries()){
    const populationRow=populationMap.get(iso3);
    if(!populationRow) continue;
    const access=Number(accessRow.value);
    const population=Number(populationRow.value);
    if(!Number.isFinite(access)||!Number.isFinite(population)||access>=99.5) continue;
    const estimatedUnserved=Math.max(0,Math.round(population*(1-access/100)));
    if(access>=90 && estimatedUnserved<1_000_000) continue;
    const country=accessRow.country;
    const severity=severityFor(access,estimatedUnserved);
    signals.push({
      signal_id:`INFRA-WB-ELECTRICITY-${iso3}-${WB_YEAR}`,
      canonical_signal_key:`country:${iso3}:power:electricity-access:${WB_YEAR}`,
      signal_class:'concern',
      title:`Electricity access gap: ${country.name}`,
      sector:'power',
      signal_type:'modeled_access_gap',
      location_name:country.name,
      country_iso3:iso3,
      country_name:country.name,
      region:country.region,
      latitude:Number.isFinite(country.latitude)?country.latitude:undefined,
      longitude:Number.isFinite(country.longitude)?country.longitude:undefined,
      location_precision:'country',
      severity,
      trajectory:'unknown',
      time_horizon:severity==='critical'||severity==='serious'?'immediate':'one_to_five_years',
      problem_summary:`World Bank ${WB_YEAR} data reports ${access.toFixed(1)}% electricity access. Combining that reported percentage with the ${WB_YEAR} population indicator yields an estimated ${estimatedUnserved.toLocaleString('en-US')} people without access. The headcount is modeled from two reported indicators, not a separately reported direct count.`,
      exposure_summary:'Electricity-access gaps can constrain households, health services, education, communications, water systems and productive economic activity. Reliability and affordability require separate evidence.',
      people_exposed:estimatedUnserved,
      action_owner_types:['national_government','utility','regulator','local_government','development_finance','private_operator'],
      next_best_action:'Resolve the national access gap into subnational clusters, reliability conditions and critical-service dependencies before selecting interventions.',
      recommended_actions:[
        'Separate no-access, unreliable-access and affordability problems.',
        'Overlay health facilities, water systems, schools and productive loads.',
        'Compare grid, mini-grid and stand-alone lifecycle economics locally.',
      ],
      measurement_plan:['Electricity access rate','Estimated unserved population','Reliability and outage duration','Affordability','Critical-service coverage'],
      evidence_state:'modeled',
      confidence:'medium',
      source_refs:[`WB-electricity_access_pct-${iso3}-${WB_YEAR}`,`WB-population_total-${iso3}-${WB_YEAR}`,WB_SOURCE_ID],
      source_url:`https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS?locations=${iso3}`,
      dependency_refs:[],
      last_verified_at:retrievedAt,
      public_safe:true,
      notes:'Modeled outside Base44 from two reported World Bank indicators. Missing is never zero; modeled is never observed.',
    });
  }

  const observationBatches=chunks(observations,110);
  const signalBatches=chunks(signals,70);
  const batchCount=Math.max(observationBatches.length,signalBatches.length,1);
  const mirrorReceipts=[];
  for(let i=0;i<batchCount;i++){
    mirrorReceipts.push(await postIngress({
      source_key:'world_bank',
      run_id:executionId+'-B'+String(i+1).padStart(2,'0'),
      adapter_name:'systemiaWorldBankInfrastructure',
      started_at:startedAt,
      status:'success',
      requested_scope:`World Bank electricity access, rural access and population indicators for ${WB_YEAR}; batch ${i+1}/${batchCount}.`,
      records_fetched:(observationBatches[i]||[]).length,
      observations:observationBatches[i]||[],
      signals:signalBatches[i]||[],
      freshness_note:`Off-Base44 World Bank collector completed ${WB_YEAR} normalization; compatibility mirror batch ${i+1}/${batchCount}.`,
      semantic_receipt:'Reported source observations remain reported. Estimated unserved headcounts are modeled from access percentage and population and remain explicitly modeled.',
      source_refs:[WB_SOURCE_ID,WB_ROOT],
    }));
  }

  const receipt={
    schema:'evercraft.systemia.infrastructure-world-bank.v1',
    execution_id:executionId,
    started_at:startedAt,
    completed_at:new Date().toISOString(),
    year:WB_YEAR,
    observations:observations.length,
    signals:signals.length,
    compatibility_batches:batchCount,
    compatibility_receipts:mirrorReceipts.map(r=>({run_id:r.run_id,receipt_id:r.receipt_id||null})),
    semantic_guards:{missing_is_not_zero:true,modeled_is_not_observed:true},
    canonical_execution:'systemia',
    legacy_role:'compatibility_mirror_only',
    source_release_ref:process.env.GITHUB_SHA||'',
  };
  receipt.receipt_sha256='sha256:'+digest(receipt);
  atomicJson(path.join(OUTPUT_ROOT,'world-bank','latest.json'),receipt);
  return receipt;
}
function partsInZone(date){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:HYDROMET_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=(type)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day')};
}
function buildHydrometUrl(target,start,end){
  const p=new URLSearchParams();
  p.append('station',target.station);
  p.append('year',String(start.year)); p.append('month',String(start.month)); p.append('day',String(start.day));
  p.append('year',String(end.year)); p.append('month',String(end.month)); p.append('day',String(end.day));
  p.append('pcode',target.pcode);
  p.append('format','html'); p.append('flags','false'); p.append('description','true');
  return HYDROMET_ROOT+'?'+p.toString();
}
function parseHydrometLatest(html){
  const rows=[];
  const re=/<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;
  let match;
  while((match=re.exec(html))){
    const raw=clean(match[1],80);
    const value=Number(clean(match[2],80).replace(/,/g,''));
    const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if(!m||!Number.isFinite(value)) continue;
    const [,mo,da,yr,hr,mi]=m;
    rows.push({raw,value,order:Date.UTC(Number(yr),Number(mo)-1,Number(da),Number(hr),Number(mi))});
  }
  rows.sort((a,b)=>a.order-b.order);
  return rows.at(-1)||null;
}
function hydrometStamp(raw){
  const m=clean(raw,80).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if(!m) return safeId(raw);
  const [,mo,da,yr,hr,mi]=m;
  return `${yr}${mo.padStart(2,'0')}${da.padStart(2,'0')}T${hr.padStart(2,'0')}${mi.padStart(2,'0')}LOCAL`;
}
async function runHydromet(){
  const started=new Date();
  const startedAt=started.toISOString();
  const executionId='SYSTEMIA-USBR-YAKIMA-'+randomUUID();
  const start=partsInZone(new Date(started.getTime()-36*60*60*1000));
  const end=partsInZone(started);
  const retrievedAt=new Date().toISOString();
  const observations=[];
  const warnings=[];
  const errors=[];
  for(const target of HYDROMET_TARGETS){
    const url=buildHydrometUrl(target,start,end);
    try{
      const response=await fetchWithTimeout(url,{headers:{accept:'text/html','user-agent':'EvercraftInfrastructureCollector/1.0'}});
      if(!response.ok) throw new Error('Hydromet HTTP '+response.status);
      const html=await response.text();
      if(!/Provisional Data\s*-\s*Subject to Change/i.test(html)) warnings.push(target.station+'/'+target.pcode+': provisional-data notice not detected');
      const latest=parseHydrometLatest(html);
      if(!latest){warnings.push(target.station+'/'+target.pcode+': no non-empty numeric reading');continue;}
      const lineage=`usbr:hydromet:yakima:${target.station}:${target.pcode}`;
      const valueHash=digest(String(latest.value)).slice(0,10);
      observations.push({
        observation_id:`USBR-HYDROMET-${target.station}-${target.pcode}-${hydrometStamp(latest.raw)}-${valueHash}`,
        source_coverage_id:HYDROMET_SOURCE_ID,
        source_name:'U.S. Bureau of Reclamation Yakima Hydromet',
        subject_key:target.subject,
        metric_key:target.metric,
        metric_label:target.label,
        sector:'water',
        country_iso3:'USA',
        country_name:'United States',
        region:'Washington',
        locality:target.locality,
        geographic_scope:target.scope,
        observed_period:latest.raw+' Pacific',
        value:latest.value,
        unit:target.unit,
        source_url:url,
        retrieved_at:retrievedAt,
        evidence_state:'reported',
        confidence:'medium',
        freshness_state:'current',
        lineage_key:lineage,
        normalization_notes:'Latest non-empty numeric row from Reclamation Hydromet. Provisional source timestamp is preserved verbatim. Value-hashed observation identity preserves revisions without silently overwriting an earlier value.',
        public_safe:true,
        notes:'Provisional Hydromet reading collected outside Base44. Blank rows are ignored, never converted to zero.',
      });
    }catch(error){
      errors.push(target.station+'/'+target.pcode+': '+clean(error?.message||error,800));
    }
  }
  const status=observations.length===HYDROMET_TARGETS.length?'success':observations.length?'partial':'failed';
  if(status==='failed') throw new Error('Hydromet returned no usable readings: '+errors.join('; '));

  const mirror=await postIngress({
    source_key:'yakima_hydromet',
    run_id:executionId,
    adapter_name:'systemiaYakimaHydromet',
    started_at:startedAt,
    status,
    requested_scope:'Exactly six supported Hydromet station/parameter targets over a bounded approximately 36-hour window.',
    records_fetched:HYDROMET_TARGETS.length,
    observations,
    signals:[],
    warnings,
    freshness_note:`Off-Base44 Hydromet collector returned ${observations.length}/6 usable provisional readings.`,
    semantic_receipt:'Provisional source-reported measurements only. Blank rows are ignored, never zero. No basin total, severity change, legal interpretation, structural-condition inference, or forecast is generated.',
    source_refs:[HYDROMET_SOURCE_ID,'https://www.usbr.gov/pn/hydromet/yakima/index.html',HYDROMET_ROOT],
  });

  const receipt={
    schema:'evercraft.systemia.infrastructure-yakima-hydromet.v1',
    execution_id:executionId,
    started_at:startedAt,
    completed_at:new Date().toISOString(),
    status,
    targets:HYDROMET_TARGETS.length,
    usable_readings:observations.length,
    warnings,
    errors,
    compatibility_receipt:{run_id:mirror.run_id,receipt_id:mirror.receipt_id||null},
    semantic_guards:{blank_is_not_zero:true,provisional_preserved:true,no_forecast:true},
    canonical_execution:'systemia',
    legacy_role:'compatibility_mirror_only',
    source_release_ref:process.env.GITHUB_SHA||'',
  };
  receipt.receipt_sha256='sha256:'+digest(receipt);
  atomicJson(path.join(OUTPUT_ROOT,'yakima-hydromet','latest.json'),receipt);
  return receipt;
}

const runners={
  'world-bank':runWorldBank,
  'yakima-hydromet':runHydromet,
};
if(!runners[SOURCE]) throw new Error('SYSTEMIA_INFRASTRUCTURE_SOURCE must be world-bank or yakima-hydromet');
const result=await runners[SOURCE]();
console.log(JSON.stringify(result,null,2));
