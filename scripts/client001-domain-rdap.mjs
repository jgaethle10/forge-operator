/**
 * Client 001 candidate-domain registry observation.
 * Public read-only Verisign .com RDAP only. No registrar login, purchase,
 * DNS changes or availability/price guarantee.
 */
import fs from 'node:fs';
const names=['onthegoquicklube.com','onthegomobilequicklube.com'];
const report={schema:'evercraft.client001.domain-candidate-rdap.v1',checked_at:new Date().toISOString(),
 readonly:true,registrar_authorized:false,domain_purchased:false,
 availability_guaranteed:false,candidates:[]};
for(const name of names){
 const target='https://rdap.verisign.com/com/v1/domain/'+name;
 let observation={name,registry:'Verisign .com RDAP',state:'unknown',http_status:null};
 try{
  const r=await fetch(target,{signal:AbortSignal.timeout(9000),headers:{accept:'application/rdap+json, application/json'}});
  observation.http_status=r.status;
  if(r.status===200){
   observation.state='registered';
  }else if(r.status===404){
   observation.state='no_registry_record_recheck_at_registrar';
  }else{
   observation.state='indeterminate_http_response';
  }
 }catch(e){
  observation.state='unreachable';
  observation.error_class=e?.name==='TimeoutError'?'timeout':'request_error';
 }
 report.candidates.push(observation);
 console.log(name+': '+observation.state+(observation.http_status===null?'':' HTTP '+observation.http_status));
}
const i=process.argv.indexOf('--out');
if(i>=0&&process.argv[i+1])fs.writeFileSync(process.argv[i+1],JSON.stringify(report,null,2)+'\n');
