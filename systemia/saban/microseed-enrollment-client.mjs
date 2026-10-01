function clean(v){return String(v??'').trim();}

function validateEnrollmentUrl(value){
  const url=new URL(String(value||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)){
    throw new Error('microseed_enrollment_https_or_loopback_required');
  }
  if(url.username||url.password) throw new Error('microseed_enrollment_url_credentials_forbidden');
  return url;
}
async function boundedJson(response,maxBytes=256*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes) throw new Error('microseed_enrollment_response_too_large');
  try{return text?JSON.parse(text):{};}
  catch{throw new Error('microseed_enrollment_response_invalid_json');}
}

export async function submitMicroSeedEnrollmentBundle({
  enrollmentUrl,
  bundle,
  fetchImpl=fetch,
  timeoutMs=15000,
}={}){
  if(bundle?.schema!=='evercraft.microseed.enrollment-bundle.v1'){
    throw new Error('microseed_enrollment_bundle_required');
  }
  const base=validateEnrollmentUrl(enrollmentUrl);
  const endpoint=new URL('/v1/enroll',base);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||15000)));
  try{
    const response=await fetchImpl(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify(bundle),
      signal:controller.signal,
    });
    const body=await boundedJson(response);
    if(!response.ok||body?.ok!==true){
      throw new Error('microseed_enrollment_http_'+response.status+':'+clean(body?.error||'enrollment_failed'));
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}
