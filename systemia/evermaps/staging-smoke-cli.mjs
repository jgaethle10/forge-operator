import {createEvermapsStagingServer} from './staging-http.mjs';
const releaseDirectory=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const {server,release}=await createEvermapsStagingServer({releaseDirectory});
try{
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const address=server.address();
 const origin='http://127.0.0.1:'+address.port;
 const [health,map,research,csv,missing,post,head]=await Promise.all([
  fetch(origin+'/api/health'),fetch(origin+'/evermaps/'),fetch(origin+'/research/'),
  fetch(origin+'/research.csv'),fetch(origin+'/wa-dnr-grant-permit-points.geojson'),
  fetch(origin+'/',{method:'POST'}),fetch(origin+'/',{method:'HEAD'})
 ]);
 const healthData=await health.json(),mapHtml=await map.text();
 if(health.status!==200||!healthData.ok||healthData.public_https_route_verified!==false||
    healthData.research_record_count!==release.research_record_count||
    map.status!==200||!mapHtml.includes('mobile-static-preview')||
    !mapHtml.includes('Object.assign(data,')||
    research.status!==200||csv.status!==200||
    !String(research.headers.get('content-type')).startsWith('text/html')||
    !String(csv.headers.get('content-type')).startsWith('text/csv')||
    missing.status!==404||post.status!==405||head.status!==200||
    !map.headers.get('content-security-policy')?.includes("connect-src 'none'"))
    throw Error('EverMaps local staging smoke mismatch');
 console.log(JSON.stringify({
  status:'local_http_research_staging_verified',
  source_hash:release.wgs_source_sha256,
  research_records:release.research_record_count,
  responses:{health:health.status,map:map.status,index:research.status,csv:csv.status,hidden:missing.status,write:post.status},
  live_https_verified:false,production_deployed:false
 },null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
