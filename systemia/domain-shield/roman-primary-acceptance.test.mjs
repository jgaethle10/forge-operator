import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINALS,KNOWN_RECOVERY_URLS,isAcceptedLandingUrl,inspectPrimaryResponse,checkOriginalDomains} from './roman-primary-acceptance.mjs';
const body='<!doctype html><html><title>Roman Kilinkaridis</title><a href="https://donate.voteroman.com/">Donations</a></html>';
const headers={'content-type':'text/html; charset=utf-8'};
function source(status,text=body,url='',contentType=headers['content-type']){
  return {status,url,headers:new Headers({'content-type':contentType}),text:async()=>text};
}
test('a public original-domain 402 fails the actual mission even with available independent mirrors',async()=>{
  const reqs=[];
  const report=await checkOriginalDomains({fetchImpl:async(url,options)=>{
    reqs.push([url,options.method]);
    return source(402,'<html>[APP UNAVAILABLE]</html>',url);
  },at:'2026-10-18T10:00:00.000Z'});
  assert.equal(report.mission_pass,false);
  assert.deepEqual(report.original_domain_visits.map(x=>x.problem),['BASE44_ORIGIN_HTTP_402','BASE44_ORIGIN_HTTP_402']);
  assert.equal(report.page_alternatives_are_not_original_domain_recovery,true);
  assert.deepEqual(reqs,ORIGINALS.map(x=>[x,'GET']));
});
test('healthy alternate alone does not count as recovery unless original request reaches it',()=>{
  const alternative=source(200,body,KNOWN_RECOVERY_URLS[0]);
  const result=inspectPrimaryResponse(ORIGINALS[0],alternative,body);
  assert.equal(result.visitor_landing_verified,true,'the externally tested ORIGINAL request ended at the verified alternate');
  assert.equal(inspectPrimaryResponse(ORIGINALS[0],source(402,'[APP UNAVAILABLE]',ORIGINALS[0]),'[APP UNAVAILABLE]').visitor_landing_verified,false);
});
test('real authorized forwarding of both original addresses to verified page qualifies',async()=>{
  const report=await checkOriginalDomains({
    fetchImpl:async original=>source(200,body,KNOWN_RECOVERY_URLS[0]),
  });
  assert.equal(report.mission_pass,true);
  assert.equal(report.original_domain_visits.length,2);
  assert.ok(report.original_domain_visits.every(x=>x.visitor_landing_verified));
});
test('no weird redirects, lookalikes, payment-domain hijacks or forged successful marker',()=>{
 for(const destination of [
   'https://voteroman.com.evil.invalid/',
   'https://donate.voteroman.com/',
   'http://voteroman.com/',
   'https://fabric.systemiacommandcenters.com.evil.invalid/campaigns/roman/',
   'https://fabric.systemiacommandcenters.com/private/',
   'https://fabric.systemiacommandcenters.com/campaigns/roman/?ref=visitor',
   'https://jgaethle10.github.io/forge-operator/other-path/',
 ])assert.equal(isAcceptedLandingUrl(destination),false,destination);
 for(const destination of [...ORIGINALS,...KNOWN_RECOVERY_URLS])assert.equal(isAcceptedLandingUrl(destination),true,destination);
 assert.equal(inspectPrimaryResponse(ORIGINALS[0],source(200,body,'https://voteroman.com.evil.invalid/'),body).visitor_landing_verified,false);
 assert.equal(inspectPrimaryResponse(ORIGINALS[0],source(200,body.replace('donate.voteroman.com/','example.test/'),ORIGINALS[0]),body.replace('donate.voteroman.com/','example.test/')).visitor_landing_verified,false);
 assert.equal(inspectPrimaryResponse(ORIGINALS[0],source(200,body,ORIGINALS[0],'application/json'),body).visitor_landing_verified,false);
});
test('network failure fails safely and is not mistaken for DNS restoration',async()=>{
 const report=await checkOriginalDomains({fetchImpl:async()=>{throw Error('network timeout')}});
 assert.equal(report.mission_pass,false);
 assert.ok(report.original_domain_visits.every(x=>x.problem==='NETWORK_UNREACHABLE'));
});
