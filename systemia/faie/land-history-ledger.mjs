// Evercraft FAIE: privately owned historical index of PUBLIC regional evidence.
// Exact visitor coordinates, personal addresses, parcel owners and copyrighted
// map images are never written here. Source revisions are never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const OFFICIAL = new Set(['usgs-water-data-api','nws-api','nwps-api','us-drought-monitor-ndmc']);
const HOSTS = new Set([
  'api.waterdata.usgs.gov','api.water.noaa.gov','api.weather.gov',
  'usdmdataservices.unl.edu','www.ncei.noaa.gov','ngmdb.usgs.gov',
  'www.usgs.gov','usgs.gov','hazards.fema.gov','www.fema.gov','fema.gov',
  'www.rma.usda.gov','www.archives.gov','archives.gov','www.yvl.org',
  'www.washingtonruralheritage.org','www.dnr.wa.gov','dnr.wa.gov',
  'sdmdataaccess.nrcs.usda.gov'
]);
const KINDS = new Set([
  'official_observation','historical_map','aerial_photo','hazard_event',
  'land_use','water_infrastructure','insurance_aggregate','historical_record'
]);
const STATES = new Set(['OBSERVED','REPORTED','MODELED','VERIFIED']);
const PRECISIONS = new Set(['day','month','year','interval','unknown']);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = (value,max=200) => String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
function isoDate(value,field,optional=false){
  if(optional && (value===null || value===undefined || value===''))return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
     !Number.isFinite(Date.parse(value+'T00:00:00Z')) ||
     new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value){
    throw new TypeError(field+'_invalid_date');
  }
  return value;
}
function isoTime(value,field){
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new TypeError(field+'_invalid_time');
  return new Date(value).toISOString();
}
function publicRegion(value){
  const key=clean(value,90);
  if(!/^region:[a-z0-9][a-z0-9._-]{1,80}$/.test(key)||
     ['region:global','region:unknown'].includes(key)){
    throw new TypeError('named_public_region_required_not_site_or_address');
  }
  return key;
}
function officialUrl(value){
  let uri;
  try{uri=new URL(value)}catch{throw new TypeError('source_url_invalid')}
  if(uri.protocol!=='https:'||!HOSTS.has(uri.hostname.toLowerCase())||
     uri.username||uri.password||uri.port){
    throw new TypeError('source_not_authorized_public_https');
  }
  return uri.href;
}
function restrictedMetadata(metadata={}){
  const allowed=[
    'county_fips','map_date','station_id','monitoring_location_id',
    'parameter_code','metric_value','metric_unit','hazard_state',
    'source_version','map_sheet_id','survey_area','rights_reference'
  ];
  const out={};
  for(const key of allowed){
    const value=metadata?.[key];
    if(['string','number','boolean'].includes(typeof value))out[key]=clean(value,120);
  }
  const result=JSON.stringify(out);
  if(result.length>3000)throw new TypeError('metadata_too_large');
  return result;
}
function validate(input){
  if(!input||typeof input!=='object')throw new TypeError('history_record_required');
  const land_id=publicRegion(input.land_id);
  const source_family=clean(input.source_family,80);
  const source_record_id=clean(input.source_record_id,160);
  if(!/^[a-z0-9][a-z0-9._:-]{2,79}$/.test(source_family)||!source_record_id){
    throw new TypeError('source_identity_missing');
  }
  const category=clean(input.category,50);
  const evidence_state=clean(input.evidence_state,30).toUpperCase();
  const time_precision=clean(input.time_precision,20);
  if(!KINDS.has(category)||!STATES.has(evidence_state)||!PRECISIONS.has(time_precision)){
    throw new TypeError('invalid_history_evidence_category_or_precision');
  }
  const event_start=isoDate(input.event_start,'event_start');
  const event_end=isoDate(input.event_end||input.event_start,'event_end');
  if(event_end<event_start)throw new TypeError('inverted_history_time_range');
  const summary=clean(input.summary,650);
  const geography_scope=clean(input.geography_scope,170);
  if(summary.length<8||!geography_scope||/^(parcel|point|site)$/i.test(geography_scope)){
    throw new TypeError('history_summary_and_public_scope_required');
  }
  const usage_rights=clean(input.usage_rights||'metadata_only_rights_unverified',95);
  if(!['metadata_only_rights_unverified','public_domain_confirmed','open_license_confirmed'].includes(usage_rights)){
    throw new TypeError('source_rights_required');
  }
  return {
    land_id,source_family,source_record_id,category,evidence_state,event_start,event_end,
    time_precision,summary,source_url:officialUrl(input.source_url),
    source_published_at:isoDate(input.source_published_at,'source_published_at',true),
    source_updated_at:isoDate(input.source_updated_at,'source_updated_at',true),
    geography_scope,usage_rights,metadata_json:restrictedMetadata(input.metadata),
    first_collected_at:isoTime(input.first_collected_at||new Date().toISOString(),'first_collected_at')
  };
}
export function publicHistoryFromOfficialObservation(observation,{collectedAt=new Date().toISOString()}={}){
  if(!observation||observation.source_system!=='systemia_sentinel_official'||
     !OFFICIAL.has(observation.source_family))return null;
  const region=Array.isArray(observation.region_keys)?observation.region_keys[0]:null;
  if(typeof region!=='string'||!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(region)||
     ['global','unknown'].includes(region))return null;
  const source_url=(Array.isArray(observation.provenance_refs)?observation.provenance_refs:[]).find(ref=>{
    try{officialUrl(ref);return true}catch{return false}
  });
  if(!source_url)return null;
  const eventDate=isoTime(observation.observed_at,'observation_observed_at').slice(0,10);
  const facts=observation.facts||{};
  return {
    land_id:'region:'+region,source_family:observation.source_family,
    source_record_id:observation.observation_id,category:'official_observation',
    evidence_state:observation.evidence_state||'reported',
    event_start:eventDate,event_end:eventDate,time_precision:'day',
    summary:observation.summary,source_url,
    geography_scope:'official '+region+' source region, not a parcel',
    first_collected_at:collectedAt,usage_rights:'metadata_only_rights_unverified',
    metadata:{
      county_fips:facts.county_fips,map_date:facts.map_date,
      monitoring_location_id:facts.monitoring_location_id,parameter_code:facts.parameter_code,
      metric_value:facts.metric_value,metric_unit:facts.metric_unit,hazard_state:facts.hazard_state
    }
  };
}
const ROW_FIELDS=[
  'land_id','source_family','source_record_id','category','evidence_state',
  'event_start','event_end','time_precision','summary','source_url',
  'source_published_at','source_updated_at','geography_scope','usage_rights','metadata_json'
];
export function openFaieLandHistory({databasePath}={}){
  if(typeof databasePath!=='string'||!databasePath)throw new TypeError('databasePath_required');
  if(databasePath!==':memory:')fs.mkdirSync(path.dirname(databasePath),{recursive:true,mode:0o700});
  const db=new DatabaseSync(databasePath);
  if(databasePath!==':memory:')fs.chmodSync(databasePath,0o600);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  db.exec('CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, land_id TEXT NOT NULL,source_family TEXT NOT NULL,source_record_id TEXT NOT NULL,category TEXT NOT NULL,evidence_state TEXT NOT NULL,event_start TEXT NOT NULL,event_end TEXT NOT NULL,time_precision TEXT NOT NULL,summary TEXT NOT NULL,source_url TEXT NOT NULL,source_published_at TEXT,source_updated_at TEXT,geography_scope TEXT NOT NULL,usage_rights TEXT NOT NULL,metadata_json TEXT NOT NULL,first_collected_at TEXT NOT NULL,payload_sha256 TEXT NOT NULL,prior_sha256 TEXT NOT NULL,entry_sha256 TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(land_id,source_family,source_record_id,payload_sha256));');
  db.exec('CREATE INDEX IF NOT EXISTS idx_history_region_time ON records(land_id,event_start,id);');
  const dupe=db.prepare('SELECT id,entry_sha256 FROM records WHERE land_id=? AND source_family=? AND source_record_id=? AND payload_sha256=?');
  const tail=db.prepare('SELECT entry_sha256 FROM records ORDER BY id DESC LIMIT 1');
  const insert=db.prepare('INSERT INTO records('+ROW_FIELDS.join(',')+',first_collected_at,payload_sha256,prior_sha256,entry_sha256,created_at) VALUES ('+new Array(ROW_FIELDS.length+5).fill('?').join(',')+')');
  const select=db.prepare('SELECT * FROM records WHERE land_id=? ORDER BY event_start,event_end,id LIMIT ?');
  const all=db.prepare('SELECT * FROM records ORDER BY id');
  const counts=db.prepare('SELECT COUNT(*) AS records,COUNT(DISTINCT land_id) AS regions,MIN(event_start) AS first_date,MAX(event_end) AS last_date FROM records');
  const regionsQuery=db.prepare('SELECT land_id,COUNT(*) AS records,MIN(event_start) AS earliest,MAX(event_end) AS latest FROM records GROUP BY land_id ORDER BY records DESC,land_id LIMIT ?');
  let closed=false;
  function openCheck(){if(closed)throw new Error('history_database_closed')}
  function append(input){
    openCheck();
    const rec=validate(input);
    const payload={};
    for(const key of ROW_FIELDS)payload[key]=rec[key];
    const digest=hash(JSON.stringify(payload));
    db.exec('BEGIN IMMEDIATE');
    try{
      const prev=dupe.get(rec.land_id,rec.source_family,rec.source_record_id,digest);
      if(prev){
        db.exec('COMMIT');
        return {action:'deduped',id:Number(prev.id),entry_sha256:prev.entry_sha256};
      }
      const prior=tail.get()?.entry_sha256||'GENESIS';
      const entry=hash(prior+'\n'+digest);
      const fields=ROW_FIELDS.map(key=>rec[key]);
      const added=insert.run(...fields,rec.first_collected_at,digest,prior,entry,new Date().toISOString());
      db.exec('COMMIT');
      return {action:'archived',id:Number(added.lastInsertRowid),land_id:rec.land_id,entry_sha256:entry};
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function listLand(land_id,{limit=200}={}){
    openCheck();
    return select.all(publicRegion(land_id),Math.max(1,Math.min(1000,Number(limit)||200)))
      .map(({metadata_json,...row})=>({...row,metadata:JSON.parse(metadata_json)}));
  }
  function verifyChain(){
    openCheck();
    let prior='GENESIS',checked=0;
    for(const rec of all.iterate()){
      const payload={};
      for(const key of ROW_FIELDS)payload[key]=rec[key];
      const digest=hash(JSON.stringify(payload));
      if(digest!==rec.payload_sha256||rec.prior_sha256!==prior||
         rec.entry_sha256!==hash(prior+'\n'+digest)){
        return {ok:false,checked,failed_record_id:rec.id};
      }
      prior=rec.entry_sha256;
      checked++;
    }
    return {ok:true,checked,tip_sha256:prior};
  }
  function stats(){
    openCheck();
    const row=counts.get();
    return {
      schema:'evercraft.faie.land-history-stats.v1',
      archived_records:Number(row.records),
      public_regions:Number(row.regions),
      earliest_record_date:row.first_date,
      latest_record_date:row.last_date,
      visitor_site_locations_persisted:false
    };
  }
  return {
    archive:append,
    archiveOfficialObservation(observation,options={}){
      const rec=publicHistoryFromOfficialObservation(observation,options);
      return rec?append(rec):{action:'skipped',reason:'not_allowlisted_public_official_source'};
    },
    listLand,verifyChain,stats,
    listPublicRegions(limit=50){
      openCheck();
      return regionsQuery.all(Math.max(1,Math.min(200,Number(limit)||50))).map(row=>({
        land_id:row.land_id,records:Number(row.records),earliest:row.earliest,latest:row.latest
      }));
    },
    close(){if(!closed){db.close();closed=true}}
  };
}
