#!/usr/bin/env node
// Public API connectivity probe only. Fixed, documented NCT identifier; no paper association.
// A successful probe proves endpoint reachability and exact ID response, not study validity.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {REGISTRY_API,normalizeClinicalTrialsStudy} from './medical-registry-crosscheck.mjs';

const nctId='NCT04437511'; // Public NCT ID used for API v2 demonstrations
const now=new Date().toISOString();
const dir=path.join(process.cwd(),'artifacts/medical-registry-crosscheck');
fs.mkdirSync(dir,{recursive:true});
const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),9000);
let status='held_source_unavailable',reason=null,officialId=null;
try{
 const response=await fetch(REGISTRY_API+nctId,{
  signal:controller.signal,headers:{accept:'application/json'}
 });
 if(response?.ok){
  const raw=await response.text();
  if(raw.length>700000)reason='response_exceeded_size_limit';
  else {
   const normalized=normalizeClinicalTrialsStudy(JSON.parse(raw),nctId);
   if(normalized){status='verified_endpoint_response';officialId=normalized.nct_id;}
   else reason='NCT_identifier_mismatch';
  }
 }else reason='http_'+String(response?.status??'unknown');
}catch(error){reason=String(error?.message||error).slice(0,120);}
finally{clearTimeout(timer);}
const body={
 schema:'evercraft.medical.registry-source-probe.v1',checked_at:now,
 endpoint:REGISTRY_API,documentation_example_nct_id:nctId,
 source_status:status,official_id_returned:officialId,
 source_hold:status==='verified_endpoint_response'?null:reason||'unavailable',
 scientific_disclaimer:'This fixed-identifier probe is unrelated to the sampled PubMed articles. It confirms API reachability only; no clinical data or results are independently verified.',
 publication_disposition:'held_with_reason'
};
const receipt='sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex');
const report={...body,receipt_hash:receipt};
fs.writeFileSync(path.join(dir,'source-health.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.source_status,reason:report.source_hold,nct_id:report.documentation_example_nct_id,receipt:report.receipt_hash}));
