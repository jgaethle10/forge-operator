import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createEvermapsStagingServer,loadVerifiedEvermapsRelease} from './staging-http.mjs';
const SHA='a'.repeat(64);
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'evermaps-staging-'));
 const docs={
  'wgs-full-import-receipt.json':{status:'source_geometry_complete_broad_phase_only',source_data_completeness:true,county:'Grant',layers:{resources:{complete:true,fetched_features:2,geometry_audit:{valid_for_mapping:true,sha256_source_features:SHA}}}},
  'source-health-manifest.json':{status:'all_research_dependencies_current',required_research_dependencies_complete:true,evidence_receipt_states:{geology:{status:'verified'},land:{status:'verified'}}},
  'research-packet.json':{schema:'evercraft.evermaps.offline-geological-research-packet.v1',research_wgs_sha256:SHA,geological_records_exported:1,rows:[{id:'wgs-grant-1'}],source_health:{full_dependency_refresh_complete:true},site_recommendations_authorized:false,public_mining_rights_verified:false,certified_reserves:false}
 };
 for(const [name,val] of Object.entries(docs))await writeFile(path.join(dir,name),JSON.stringify(val));
 await writeFile(path.join(dir,'research-map-preloaded.html'),'<html><svg id="mobile-static-preview"></svg><script>Object.assign(data,{});preview.hidden=true</script></html>');
 await writeFile(path.join(dir,'research-brief.html'),'<html>research</html>');
 await writeFile(path.join(dir,'research-index.csv'),'WGS_OBJECTID\n1\n');
 return {dir,docs};
}
test('unverified public route is never reported active even with source verification',async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const {server,release}=await createEvermapsStagingServer({releaseDirectory:f.dir});
 assert.equal(release.public_https_route_verified,false);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 const [health,map,hidden,post,head]=await Promise.all([
  fetch(origin+'/api/health'),fetch(origin+'/'),fetch(origin+'/research-packet.json'),
  fetch(origin+'/',{method:'POST'}),fetch(origin+'/',{method:'HEAD'})
 ]);
 assert.equal((await health.json()).public_https_route_verified,false);
 assert.equal(map.status,200);
 assert.equal(hidden.status,404);
 assert.equal(post.status,405);
 assert.equal(head.status,200);
 assert.match(map.headers.get('content-security-policy'),/connect-src 'none'/);
});
test('staging admission refuses missing source or packet rights gates',async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const file=path.join(f.dir,'source-health-manifest.json');
 await writeFile(file,JSON.stringify({...f.docs['source-health-manifest.json'],status:'research_source_dependency_hold'}));
 await assert.rejects(()=>loadVerifiedEvermapsRelease({directory:f.dir}),/dependency holds/);
 await writeFile(file,JSON.stringify(f.docs['source-health-manifest.json']));
 const p=path.join(f.dir,'research-packet.json');
 await writeFile(p,JSON.stringify({...f.docs['research-packet.json'],site_recommendations_authorized:true}));
 await assert.rejects(()=>loadVerifiedEvermapsRelease({directory:f.dir}),/improperly eligible/);
});
test('unknown and missing assets fail closed instead of SPA fallthrough',async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 await rm(path.join(f.dir,'research-map-preloaded.html'));
 await assert.rejects(()=>createEvermapsStagingServer({releaseDirectory:f.dir}));
});
