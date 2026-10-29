import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handleDealStatus } from '../backend/deal-status.mjs';
import { validateHubspotV3, normalizeHubspotSignedUrl } from '../backend/signature.mjs';

const secret='test-secret-long-enough-to-sign-not-real';
const origin='https://relay.example.org';
const now=1793232000000;
const params='dealId=78&portalId=100&appId=300&userId=55';
const makeRequest=({query=params,method='GET',timestamp=now,body='',sig=true}={})=>{
  const rawUrl='/v1/hubspot/deal-status?'+query;
  const data=method+normalizeHubspotSignedUrl(origin+rawUrl)+body+timestamp;
  const signature=createHmac('sha256',secret).update(data).digest('base64');
  return {method,rawUrl,rawBody:body,headers:{
    'x-hubspot-signature-v3':sig?signature:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'x-hubspot-request-timestamp':String(timestamp),
  }};
};
const opts={
  publicOrigin:origin,clientSecret:secret,appId:'300',admittedPortals:['100'],now,
  authorizeDealAccess:async ({portalId,dealId,userId})=>portalId==='100'&&dealId==='78'&&userId==='55',
  readRelayStatus:async ()=>({state:'awaiting_acknowledgments',version:2,acknowledgedCount:1,expectedCount:2}),
};
test('valid signed request returns sanitized genuine-state shape',async()=>{
 const result=await handleDealStatus(makeRequest(),opts);
 assert.equal(result.status,200);
 assert.deepEqual(result.body,{schema:'evercraft.relay.hubspot.status.v1',code:'OK',state:'awaiting_acknowledgments',expectedCount:2,acknowledgedCount:1,version:2});
});
test('signature, tamper, replay window and future timestamp fail closed',async()=>{
 assert.equal((await handleDealStatus(makeRequest({sig:false}),opts)).status,401);
 const tampered=makeRequest();tampered.rawUrl=tampered.rawUrl.replace('dealId=78','dealId=79');
 assert.equal((await handleDealStatus(tampered,opts)).status,401);
 assert.equal((await handleDealStatus(makeRequest({timestamp:now-300001}),opts)).status,401);
 assert.equal((await handleDealStatus(makeRequest({timestamp:now+300001}),opts)).status,401);
 assert.equal(validateHubspotV3({method:'GET',absoluteUrl:origin+'/x',headers:{},clientSecret:secret,now}),false);
});
test('tenant app user and deal authorization remain independent of signature',async()=>{
 for(const query of [
  'dealId=78&portalId=101&appId=300&userId=55',
  'dealId=78&portalId=100&appId=301&userId=55',
  'dealId=79&portalId=100&appId=300&userId=55',
  'dealId=78&portalId=100&appId=300&userId=56',
 ])assert.ok([403].includes((await handleDealStatus(makeRequest({query}),opts)).status));
 assert.equal((await handleDealStatus(makeRequest({query:'dealId=78&portalId=100&appId=300&userId=55&dealId=79'}),opts)).status,400);
});
test('no adapters, no install registry, or no secret means no customer data',async()=>{
 assert.equal((await handleDealStatus(makeRequest(),{...opts,readRelayStatus:undefined})).status,503);
 assert.equal((await handleDealStatus(makeRequest(),{...opts,admittedPortals:[]})).status,403);
 assert.equal((await handleDealStatus(makeRequest(),{...opts,clientSecret:undefined})).status,503);
 assert.equal((await handleDealStatus(makeRequest(),{...opts,readRelayStatus:()=>{throw Error('db offline')}})).status,503);
});
test('read-only methods and validation refuse unsupported write paths',async()=>{
 assert.equal((await handleDealStatus(makeRequest({method:'POST'}),opts)).status,405);
 assert.equal((await handleDealStatus(makeRequest({body:'x'}),opts)).status,400);
 assert.equal((await handleDealStatus(makeRequest(),{...opts,readRelayStatus:async()=>({state:'awaiting_acknowledgments',expectedCount:1,acknowledgedCount:2,version:1})})).status,503);
 const noReview=await handleDealStatus(makeRequest(),{...opts,readRelayStatus:async()=>null});
 assert.equal(noReview.body.state,'no_review');
});
test('project config uses non-legacy OAuth app card, no unapproved production URL',()=>{
 const root=new URL('../',import.meta.url);
 const project=JSON.parse(readFileSync(new URL('hsproject.json',root)));
 const app=JSON.parse(readFileSync(new URL('src/app/app-hsmeta.json',root)));
 const card=JSON.parse(readFileSync(new URL('src/app/cards/relay-deal-hsmeta.json',root)));
 const component=readFileSync(new URL('src/app/cards/RelayDealCard.jsx',root),'utf8');
 assert.equal(project.platformVersion,'2026.09');
 assert.equal(app.config.distribution,'marketplace');
 assert.equal(app.config.auth.type,'oauth');
 assert.ok(app.config.auth.requiredScopes.includes('crm.objects.deals.read'));
 assert.equal(card.config.location,'crm.record.tab');
 assert.deepEqual(card.config.objectTypes,['DEALS']);
 assert.ok(app.config.permittedUrls.fetch.every(x=>x.includes('.invalid/')));
 assert.match(component,/hubspot\.fetch/);
 assert.doesNotMatch(component,/(?<!\.)\bfetch\s*\(|crm\.objects\.deals\.write|localStorage|window\.fetch/);
});
