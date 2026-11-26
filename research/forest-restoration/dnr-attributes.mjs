// FOREST-001: bounded, read-only DNR attribute collection. No live scheduling or ledger writes.
// node research/forest-restoration/dnr-attributes.mjs --self-test
// node research/forest-restoration/dnr-attributes.mjs --collect (private stdout; do not publish raw records)
import {createHash} from 'node:crypto';
const ROOT='https://services.arcgis.com/4x406oNViizbGo13/ArcGIS/rest/services/Completed_FH_Treatments_2017_2022_EWA/FeatureServer/0';
async function collect(get) {
  const fields=['OBJECTID','GlobalID','DATE_COMPL','ACTIVITY','TREATMENT','ACRES_TREATED','GIS_ACRES'];
  const maxIds=100000, batchSize=500;
  const fail=reason=>{throw new Error(reason)};
  const check=v=>{if(!v||typeof v!=='object'||v.error)fail('source_error');return v};
  const meta=async()=>{
    const m=check(await get('',{f:'json'}));
    if(m.geometryType!=='esriGeometryPolygon'||m.objectIdField!=='OBJECTID'||!fields.every(k=>m.fields?.some(f=>f.name===k)))fail('schema_drift');
    if(!Number.isSafeInteger(m.maxRecordCount)||m.maxRecordCount<1)fail('record_limit_missing');
    const rev=m.editingInfo?.lastEditDate;
    if(!Number.isSafeInteger(rev)||rev<=0)fail('revision_unverified');
    return {name:m.name,revision:rev,limit:Math.min(batchSize,m.maxRecordCount)};
  };
  const inventory=async()=>{
    const c=check(await get('/query',{f:'json',where:'1=1',returnCountOnly:'true'}));
    if(!Number.isSafeInteger(c.count)||c.count<0||c.count>maxIds)fail('invalid_or_excessive_count');
    const i=check(await get('/query',{f:'json',where:'1=1',returnIdsOnly:'true'}));
    if(i.exceededTransferLimit||i.objectIdFieldName!=='OBJECTID'||!Array.isArray(i.objectIds)||i.objectIds.length!==c.count||i.objectIds.some(n=>!Number.isSafeInteger(n)||n<0)||new Set(i.objectIds).size!==c.count)fail('inventory_mismatch');
    return i.objectIds.slice().sort((a,b)=>a-b);
  };
  const first=await meta(), ids=await inventory(), rows=[], seenIds=new Set(), seenGlobal=new Set();
  const acreage=v=>{if(v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0)fail('invalid_acreage');return v};
  const label=v=>{if(v===null)return null;if(typeof v!=='string'||v.length>255)fail('invalid_label');return v};
  for(let k=0;k<ids.length;k+=first.limit){
    const batch=ids.slice(k,k+first.limit), wanted=new Set(batch);
    const p=check(await get('/query',{f:'json',objectIds:batch.join(','),outFields:fields.join(','),returnGeometry:'false'}));
    if(p.exceededTransferLimit||!Array.isArray(p.features)||p.features.length!==batch.length)fail('incomplete_batch');
    for(const f of p.features){
      const a=f.attributes;
      if(!a||!fields.every(k=>Object.prototype.hasOwnProperty.call(a,k))||!wanted.has(a.OBJECTID)||seenIds.has(a.OBJECTID))fail('unexpected_or_duplicate_id');
      const g=typeof a.GlobalID==='string'?a.GlobalID.toLowerCase().replace(/[{}]/g,''):'';
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(g)||seenGlobal.has(g))fail('invalid_or_duplicate_global_id');
      if(a.DATE_COMPL!==null&&(!Number.isSafeInteger(a.DATE_COMPL)||!Number.isFinite(new Date(a.DATE_COMPL).getTime())))fail('invalid_date');
      seenIds.add(a.OBJECTID);seenGlobal.add(g);
      rows.push({object_id:a.OBJECTID,global_id:g,completion_epoch_ms:a.DATE_COMPL,activity:label(a.ACTIVITY),treatment:label(a.TREATMENT),reported_acres:acreage(a.ACRES_TREATED),gis_acres:acreage(a.GIS_ACRES)});
    }
  }
  const secondIds=await inventory(), second=await meta();
  if(first.name!==second.name||first.revision!==second.revision||JSON.stringify(ids)!==JSON.stringify(secondIds)||rows.length!==ids.length)fail('source_changed_during_read');
  rows.sort((a,b)=>a.object_id-b.object_id);
  const measure=key=>{
    const valid=rows.filter(r=>r[key]!==null);
    const sum=valid.reduce((n,r)=>n+r[key],0);
    if(!Number.isFinite(sum))fail('acreage_overflow');
    return {sum_of_nonnull_records:valid.length?sum:null,non_null_count:valid.length,missing_count:rows.length-valid.length};
  };
  return {schema:'evercraft.forest-001.dnr-attribute-snapshot.v1',state:'RECONCILED_ATTRIBUTES_ONLY',source_name:first.name,source_revision_epoch_ms:first.revision,record_count:rows.length,reported_acres:measure('reported_acres'),gis_acres:measure('gis_acres'),unique_treated_footprint_acres:null,recoverable_timber_mbf:null,geometry_ingested:false,public_release_authorized:false,rights:'unverified',rows};
}
async function selfTest(){
  const names=['OBJECTID','GlobalID','DATE_COMPL','ACTIVITY','TREATMENT','ACRES_TREATED','GIS_ACRES'];
  const sample=[1,2].map(n=>({attributes:{OBJECTID:n,GlobalID:'00000000-0000-0000-0000-00000000000'+n,DATE_COMPL:null,ACTIVITY:'fixture',TREATMENT:null,ACRES_TREATED:n===1?10:null,GIS_ACRES:12}}));
  const fixture=(fault='')=>{
    let inv=0,metaReads=0;
    return async (path,q)=>{
      if(!path){metaReads++;return {name:'fixture',geometryType:'esriGeometryPolygon',objectIdField:'OBJECTID',maxRecordCount:1,fields:names.map(name=>({name})),editingInfo:{lastEditDate:fault==='revision'&&metaReads>1?2:1}};}
      if(q.returnCountOnly)return {count:fault==='count'?3:2};
      if(q.returnIdsOnly){inv++;return {objectIdFieldName:'OBJECTID',objectIds:fault==='changed'&&inv>1?[1,3]:[2,1]};}
      const n=Number(q.objectIds), row=JSON.parse(JSON.stringify(sample[n-1]));
      if(fault==='negative')row.attributes.ACRES_TREATED=-1;
      if(fault==='duplicate')row.attributes.GlobalID=sample[0].attributes.GlobalID;
      if(fault==='missing')delete row.attributes.GIS_ACRES;
      return {features:fault==='truncated'?[]:[row]};
    };
  };
  let passed=0;
  const check=(v)=>{if(!v)throw new Error('fixture_assertion_failed');passed++;};
  const r=await collect(fixture());
  check(r.record_count===2&&r.rows[0].object_id===1);
  check(r.reported_acres.sum_of_nonnull_records===10&&r.reported_acres.missing_count===1);
  check(r.gis_acres.sum_of_nonnull_records===24&&r.unique_treated_footprint_acres===null);
  check(r.recoverable_timber_mbf===null&&!r.public_release_authorized);
  for(const fault of ['count','changed','revision','negative','duplicate','missing','truncated']){
    let rejected=false;try{await collect(fixture(fault))}catch{rejected=true}check(rejected);
  }
  return {state:'PASS',assertions:passed,scope:'synthetic fixtures only'};
}
async function liveGet(path,params){
  if(path!==''&&path!=='/query')throw new Error('invalid_endpoint');
  const url=new URL(ROOT+path);url.search=new URLSearchParams(params).toString();
  const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
  if(!res.ok||!res.body)throw new Error('source_http_'+res.status);
  const reader=res.body.getReader(),parts=[];let bytes=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16000000){await reader.cancel();throw new Error('response_limit');}parts.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
try{
  const arg=process.argv[2];
  if(arg==='--self-test')console.log(JSON.stringify(await selfTest()));
  else if(arg==='--collect'){
    const snapshot=await collect(liveGet);
    const sha256=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    console.log(JSON.stringify({source_url:ROOT,retrieved_at:new Date().toISOString(),sha256,snapshot}));
  }else throw new Error('explicit_mode_required');
}catch(e){console.error(JSON.stringify({state:'HOLD',reason:String(e.message)}));process.exitCode=1;}
