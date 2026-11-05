import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySignalPublic } from '../scripts/probe-signal-public.mjs';

const html='<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Savannah River Laboratory Fire | Evercraft Signal</title></head><body><main id="known"><section id="timeline"></section><section id="sources"></section><p>No live feed connected</p><p>not live radiation monitoring</p><a href="./incidents/savannah-river-20261028.json">Case data</a></main></body></html>';
const data={schema:'evercraft.signal.incident.v1',id:'us-sc-savannah-river-laboratory-fire-2026-10-28',monitoring_state:'static_editorial_case_not_live',official_emergency_status:'terminated',editorial_snapshot_date:'2026-10-29',sources:[{id:'1'},{id:'2'},{id:'3'}],verified:[{claim:'A',source_ids:['1']}],reported_not_confirmed:[{claim:'B',source_ids:['2']}],timeline:[{event:'C',source_ids:['3']}]};
const root='https://jgaethle10.github.io/forge-operator/';
function responses({page=html,caseData=data,status=200}={}) {
  return async url=>new Response(url.endsWith('.json') ? JSON.stringify(caseData) : page, {status,headers:{'content-type':'text/plain'}});
}
test('successful check returns URLs and a narrow truthful proof',async()=>{
  const result=await verifySignalPublic({pagesRoot:root,fetchImpl:responses()});
  assert.equal(result.verified,true);
  assert.equal(result.page_url,root+'signal/');
  assert.equal(result.case_data_url,root+'signal/incidents/savannah-river-20261028.json');
  assert.match(result.claim,/not live incident monitoring/);
});
test('no public verification for fabricated live data or invalid source references',async()=>{
  await assert.rejects(verifySignalPublic({pagesRoot:root,fetchImpl:responses({caseData:{...data,monitoring_state:'live'}})}),/SIGNAL_PUBLIC_HTTPS_VERIFICATION_FAILED/);
  await assert.rejects(verifySignalPublic({pagesRoot:root,fetchImpl:responses({caseData:{...data,verified:[{source_ids:['fake']}]} })}),/SIGNAL_PUBLIC_HTTPS_VERIFICATION_FAILED/);
});
test('404, wrong or absent HTML and insecure origins fail closed',async()=>{
  await assert.rejects(verifySignalPublic({pagesRoot:root,fetchImpl:responses({status:404})}),/SIGNAL_PUBLIC_HTTPS_VERIFICATION_FAILED/);
  await assert.rejects(verifySignalPublic({pagesRoot:root,fetchImpl:responses({page:'<h1>404</h1>'})}),/SIGNAL_PUBLIC_HTTPS_VERIFICATION_FAILED/);
  await assert.rejects(verifySignalPublic({pagesRoot:'http://localhost/',fetchImpl:responses()}),/HTTPS_ROOT_REQUIRED/);
});
test('bounded retries permit a recently deployed route to catch up',async()=>{
  let count=0;
  const fetchImpl=async url=>{count++; if(count<3)return new Response('not found',{status:404});return responses()(url);};
  const result=await verifySignalPublic({pagesRoot:root,fetchImpl,attempts:3,delayImpl:async()=>{}});
  assert.equal(result.verified,true);
  assert.ok(count>=4);
});
