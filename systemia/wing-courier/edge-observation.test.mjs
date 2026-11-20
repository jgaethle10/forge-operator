import assert from 'node:assert/strict';
import test from 'node:test';
import {observeCourierEdgePrerequisite,OWNED_FABRIC_HEALTH} from './edge-observation.mjs';

const fake=(status,obj,extra={})=>async(url,opts)=>{
 assert.equal(url,OWNED_FABRIC_HEALTH);
 assert.equal(opts.method,'GET');
 assert.equal(opts.redirect,'manual');
 assert.equal(opts.headers.accept,'application/json');
 return new Response(typeof obj==='string'?obj:JSON.stringify(obj),{
  status,headers:{'content-type':'application/json',...extra}
 });
};
test('identity-attested actual Fabric health does NOT imply live Wing Courier service',async()=>{
 const x=await observeCourierEdgePrerequisite({fetchImpl:fake(200,{
  ok:true,service:'evercraft-fabric-local',deployment_receipt_bound:true})});
 assert.equal(x.ownedHttpsReachable,true);
 assert.equal(x.deploymentReceiptBound,true);
 assert.equal(x.wingCourierEndpointVerified,false);
 assert.equal(x.decision,'HOLD_NOT_DEPLOYED');
 assert.equal(x.customerBytesTransferred,false);
});
test('non-200 health cannot be marked reachable',async()=>{
 const x=await observeCourierEdgePrerequisite({fetchImpl:fake(503,{ok:false})});
 assert.equal(x.httpStatus,503);
 assert.equal(x.ownedHttpsReachable,false);
 assert.equal(x.reason,'unhealthy_http_status');
});
test('wrong service body cannot impersonate owned Fabric',async()=>{
 const x=await observeCourierEdgePrerequisite({fetchImpl:fake(200,{
  ok:true,service:'unexpected'})});
 assert.equal(x.identityVerified,false);
 assert.equal(x.decision,'HOLD_NOT_DEPLOYED');
});
test('malformed and oversized responses fail closed',async()=>{
 const malformed=await observeCourierEdgePrerequisite({fetchImpl:fake(200,'{bad json')});
 assert.equal(malformed.reason,'health_invalid_json');
 const big=await observeCourierEdgePrerequisite({fetchImpl:fake(200,'x'.repeat(129*1024))});
 assert.equal(big.reason,'oversized_health_response');
});
test('blocked external network is recorded, not misrepresented as an active owned edge',async()=>{
 const x=await observeCourierEdgePrerequisite({fetchImpl:async()=>{throw new Error('DNS could not resolve')}});
 assert.equal(x.reason,'network_or_transport_unavailable');
 assert.equal(x.responded,false);
 assert.equal(x.wingCourierEndpointVerified,false);
 assert.equal(Object.values(x).some(v=>typeof v==='string'&&v.includes('DNS could not resolve')),false);
});
