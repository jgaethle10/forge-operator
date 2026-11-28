// Sanitized diagnostics for allowlisted public data endpoints. No body capture,
// redirect following, credentials, file writes, or changes to TLS verification.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const registry=JSON.parse(fs.readFileSync(new URL('./wa-source-acquisition.v1.json',import.meta.url),'utf8'));
const code=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(x)?x:null;
export function describeCaptureError(error){
 const codes=[];
 let current=error;
 for(let i=0;current&&i<4;i++,current=current.cause){
  const c=code(current.code);if(c&&!codes.includes(c))codes.push(c);
 }
 return {errorName:['TypeError','Error','TimeoutError','AbortError'].includes(error?.name)?error.name:'Unknown',
  causeCodes:codes,knownReason:/^[a-z_]{3,90}$/.test(String(error?.message||''))?error.message:null};
}
export async function diagnoseEcologyEndpoint({sourceKey,fetcher=fetch}={}){
 const source=registry.sources.find(x=>x.key===sourceKey);
 if(!source)throw Error('source_not_allowlisted');
 const base={schema:'evercraft.circular-recovery.transport-diagnostic.v1',sourceKey,bodyCaptured:false,redirectFollowed:false,productionChanged:false};
 try{
  const response=await fetcher(source.url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
   headers:{accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  const location=response.headers.get('location');
  let target=null;
  if(location){try{const u=new URL(location,source.url);
   target={protocol:u.protocol,host:u.hostname,path:u.pathname.slice(0,400),hasQuery:!!u.search,hasCredentials:!!(u.username||u.password)};
  }catch{target={invalid:true}}}
  const contentType=response.headers.get('content-type')?.split(';')[0].trim()||null;
  const length=response.headers.get('content-length');
  if(response.body)await response.body.cancel().catch(()=>{});
  return {...base,status:'http_response',httpStatus:response.status,contentType,
   contentLength:length&&/^\d{1,12}$/.test(length)?Number(length):null,redirectTarget:target};
 }catch(error){return {...base,status:'transport_failed',...describeCaptureError(error)}}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const [sourceKey,...extra]=process.argv.slice(2);
 if(!sourceKey||extra.length){console.error('usage: node wa-source-diagnose.mjs SOURCE_KEY');process.exitCode=2}
 else{try{console.log(JSON.stringify(await diagnoseEcologyEndpoint({sourceKey})));}
 catch(e){console.error(JSON.stringify({status:'held',...describeCaptureError(e)}));process.exitCode=1}}
}
