import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { regionMatchesRecord } from './geo-normalization.mjs';

const clean=(v)=>String(v??'').trim();
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const safe=(v)=>{
  const s=clean(v);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(s)) throw new Error('domain_or_key_invalid');
  return s;
};
const n=(v)=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
const when=(v)=>{const x=Date.parse(String(v||''));return Number.isFinite(x)?x:null;};

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function rootFor(stateDir){return path.resolve(stateDir);}
function domainRoot(stateDir,domain){return path.join(rootFor(stateDir),'domains',safe(domain));}
function indexFile(stateDir,domain){return path.join(domainRoot(stateDir,domain),'index.json');}
function objectsDir(stateDir,domain){return path.join(domainRoot(stateDir,domain),'objects');}
function loadIndex(stateDir,domain){
  const file=indexFile(stateDir,domain);
  if(!fs.existsSync(file)) return {schema:'evercraft.aliev.domain-index.v1',domain:safe(domain),entries:{},updated_at:null};
  const x=JSON.parse(fs.readFileSync(file,'utf8'));
  if(x?.schema!=='evercraft.aliev.domain-index.v1'||x?.domain!==safe(domain)) throw new Error('domain_index_invalid');
  return x;
}
function logicalKey(record,i=0){
  for(const key of ['record_key','external_id','aggregate_key','profile_key','snapshot_key','evidence_key','benchmark_key','station_external_id','source_station_id','id']){
    const v=clean(record?.[key]);
    if(v) return v.replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,160);
  }
  const coords=[n(record?.latitude),n(record?.longitude)];
  const address=clean(record?.address||record?.matched_address);
  if(coords[0]!==null&&coords[1]!==null) return 'coord:'+coords[0].toFixed(6)+','+coords[1].toFixed(6)+':'+i;
  if(address) return 'address:'+address.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,140)+':'+i;
  return 'content:'+sha(Buffer.from(JSON.stringify(record))).slice(0,32);
}
function retrievedAt(record,source){
  return clean(record?.source_retrieved_at||record?.retrieved_at||record?.updated_at||source?.retrieved_at||new Date().toISOString());
}
function haversineMiles(aLat,aLon,bLat,bLon){
  const toRad=(d)=>d*Math.PI/180,R=3958.7613;
  const dLat=toRad(bLat-aLat),dLon=toRad(bLon-aLon);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));
}

export function ingestAliEvDomainRecords({stateDir,domain,records=[],source={}}={}){
  if(!stateDir) throw new Error('stateDir is required');
  const d=safe(domain);
  if(!Array.isArray(records)) throw new Error('records must be an array');
  const index=loadIndex(stateDir,d);
  const objectDir=objectsDir(stateDir,d);
  fs.mkdirSync(objectDir,{recursive:true,mode:0o750});
  let inserted=0,updated=0,stale=0,deduped=0;
  const receipts=[];
  records.forEach((record,i)=>{
    if(!record||typeof record!=='object') throw new Error('domain_record_invalid');
    const key=logicalKey(record,i);
    const canonical={
      schema:'evercraft.aliev.domain-record.v1',
      domain:d,
      record_key:key,
      retrieved_at:retrievedAt(record,source),
      source:{
        name:clean(record?.source_name||source?.name)||null,
        url:clean(record?.source_url||source?.url)||null,
        vintage:clean(record?.source_vintage||record?.source_updated_at||source?.vintage)||null,
        evidence_state:clean(record?.evidence_state||source?.evidence_state)||null,
        data_status:clean(record?.data_status||source?.data_status)||null,
      },
      record,
    };
    const bytes=Buffer.from(JSON.stringify(canonical));
    const digest=sha(bytes);
    const file=path.join(objectDir,digest+'.json');
    if(!fs.existsSync(file)) fs.writeFileSync(file,bytes,{mode:0o600});
    const reopened=fs.readFileSync(file);
    if(sha(reopened)!==digest||reopened.byteLength!==bytes.byteLength) throw new Error('domain_object_integrity_failed');
    const prior=index.entries[key]||null;
    const pt=when(prior?.retrieved_at),ct=when(canonical.retrieved_at);
    if(prior?.sha256===digest){
      deduped++;
    }else if(prior&&pt!==null&&ct!==null&&pt>ct){
      stale++;
    }else{
      index.entries[key]={
        sha256:digest,
        byte_count:bytes.byteLength,
        retrieved_at:canonical.retrieved_at,
        latitude:n(record?.latitude),
        longitude:n(record?.longitude),
        postal_code:clean(record?.postal_code)||null,
        state:clean(record?.state||record?.state_code||record?.jurisdiction)||null,
        city:clean(record?.city)||null,
      };
      if(prior) updated++; else inserted++;
    }
    receipts.push({record_key:key,sha256:digest,byte_count:bytes.byteLength,retrieved_at:canonical.retrieved_at});
  });
  index.updated_at=new Date().toISOString();
  atomicJson(indexFile(stateDir,d),index);
  return {
    schema:'evercraft.aliev.domain-ingest-receipt.v1',
    domain:d,
    submitted:records.length,inserted,updated,stale,deduped,
    active_records:Object.keys(index.entries).length,
    receipts,
  };
}

function readActive(stateDir,domain){
  const d=safe(domain),index=loadIndex(stateDir,d),root=rootFor(stateDir);
  const rows=[];
  for(const [recordKey,entry] of Object.entries(index.entries||{})){
    const file=path.resolve(objectsDir(stateDir,d),String(entry.sha256)+'.json');
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)) throw new Error('domain_object_missing');
    const bytes=fs.readFileSync(file);
    if(sha(bytes)!==entry.sha256||bytes.byteLength!==Number(entry.byte_count||0)) throw new Error('domain_object_integrity_failed');
    const canonical=JSON.parse(bytes.toString('utf8'));
    rows.push({record_key:recordKey,...canonical.record,_meta:{sha256:entry.sha256,retrieved_at:canonical.retrieved_at,source:canonical.source}});
  }
  return rows;
}

export function queryAliEvDomain({
  stateDir,domain,latitude=null,longitude=null,radiusMiles=null,postalCode='',state='',limit=50,predicate=null
}={}){
  let rows=readActive(stateDir,domain);
  const lat=n(latitude),lon=n(longitude),radius=n(radiusMiles);
  const postal=clean(postalCode).toLowerCase(),region=clean(state).toLowerCase();
  rows=rows.map(row=>{
    const rlat=n(row.latitude),rlon=n(row.longitude);
    const distance=lat!==null&&lon!==null&&rlat!==null&&rlon!==null?haversineMiles(lat,lon,rlat,rlon):null;
    return {...row,_distance_miles:distance};
  }).filter(row=>{
    if(postal&&clean(row.postal_code).toLowerCase()!==postal) return false;
    if(region&&!regionMatchesRecord(row,region)) return false;
    if(radius!==null&&row._distance_miles!==null&&row._distance_miles>radius) return false;
    if(radius!==null&&lat!==null&&lon!==null&&row._distance_miles===null) return false;
    if(typeof predicate==='function'&&!predicate(row)) return false;
    return true;
  });
  rows.sort((a,b)=>{
    const ad=a._distance_miles??Number.POSITIVE_INFINITY,bd=b._distance_miles??Number.POSITIVE_INFINITY;
    if(ad!==bd)return ad-bd;
    return (when(b._meta?.retrieved_at)||0)-(when(a._meta?.retrieved_at)||0);
  });
  return rows.slice(0,Math.max(1,Math.min(500,Number(limit)||50)));
}

export function aliEvDomainHealth({stateDir,domains=[]}={}){
  const result={};
  for(const domain of domains){
    const index=loadIndex(stateDir,domain);
    result[domain]={active_records:Object.keys(index.entries||{}).length,updated_at:index.updated_at||null};
  }
  return {schema:'evercraft.aliev.domain-health.v1',domains:result,observed_at:new Date().toISOString()};
}
