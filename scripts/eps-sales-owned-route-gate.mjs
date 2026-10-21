/** EPS Sales independent public smoke; NEVER a production release authorization. */
export function verifyOrigin(input) {
  if (!input) throw new Error('BLOCKED: No approved EPS_SALES_PUBLIC_ORIGIN has been supplied');
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' || u.port) {
    throw new Error('BLOCKED: Expected a clean production HTTPS origin (no path, port, credentials or query)');
  }
  if (/(^|\.)base44\.(app|com)$/.test(u.hostname) || /\.(?:github\.io|pages\.dev)$/.test(u.hostname)) {
    throw new Error('BLOCKED: A provider placeholder or static-file host is not an approved owned EPS runtime');
  }
  return u.origin;
}
const placeholder = /(?:isn.t available yet|this app isn.t available|publish the app in builder|start building|base44)/i;
export async function probe(origin,{fetcher=fetch,timeout=10000}={}) {
  const base=verifyOrigin(origin);
  async function get(path){
    const r=await fetcher(base+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeout)});
    return {status:r.status,type:r.headers.get('content-type')||'',body:await r.text(),location:r.headers.get('location')};
  }
  const homepage=await get('/');
  if(homepage.status!==200 || !homepage.type.includes('text/html') || placeholder.test(homepage.body) || !homepage.body.includes('EPS SALES COMMAND')) {
    throw new Error('BLOCKED: EPS app shell absent or replaced by a provider holding page');
  }
  const health=await get('/health');
  let reported;
  try{reported=JSON.parse(health.body)}catch{throw new Error('BLOCKED: Expected machine-readable owned health receipt')}
  if(health.status!==200 || !health.type.includes('application/json') || reported.ok!==true || reported.service!=='eps-sales'){
    throw new Error('BLOCKED: The independent EPS runtime did not report healthy');
  }
  const js=await get('/app.js');
  if(js.status!==200 || !/javascript/i.test(js.type) || !js.body.includes('/api/'))throw new Error('BLOCKED: EPS interactive client bundle missing');
  const css=await get('/style.css');
  if(css.status!==200 || !/css/i.test(css.type))throw new Error('BLOCKED: EPS stylesheet missing');
  const privateJobs=await get('/api/jobs');
  const privateMe=await get('/api/me');
  if(privateJobs.status!==401 || privateMe.status!==401)throw new Error('BLOCKED: Unauthenticated private API exposed or misrouted');
  return {
    schema:'evercraft.eps.public-smoke.v1',status:'PUBLIC_SMOKE_ONLY',origin:base,
    checks:{html:200,health:200,client_bundle:200,styles:200,anonymous_jobs:401,anonymous_identity:401},
    authenticated_field_device:'NOT_TESTED',saved_records:'NOT_TESTED',photo_upload:'NOT_TESTED',customer_pdf:'NOT_TESTED',release_authorized:false
  };
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  try{console.log(JSON.stringify(await probe(process.argv[2]||process.env.EPS_SALES_PUBLIC_ORIGIN),null,2))}
  catch(e){console.error(e.message);process.exitCode=1}
}
