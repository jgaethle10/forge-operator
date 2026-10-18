import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './worker.mjs';
import { EPS_HTML, HAVENLY_HTML, EPS_ESTIMATOR_HTML } from './embedded-sites.mjs';
import { embeddedSource } from './generate-embedded.mjs';
import fs from 'node:fs';
const req=(host,path='/',method='GET')=>new Request('https://'+host+path,{method});
const invoke=(host,path='/',method='GET',env={})=>handleRequest(req(host,path,method),{env});

test('generated site bytes exactly match EPS, HAVENLY and calculator originals',()=>{
  assert.equal(EPS_HTML,fs.readFileSync(new URL('../../../public/eps/index.html',import.meta.url),'utf8'));
  assert.equal(HAVENLY_HTML,fs.readFileSync(new URL('../../../public/havenly/index.html',import.meta.url),'utf8'));
  assert.equal(EPS_ESTIMATOR_HTML,fs.readFileSync(new URL('../../../public/apps/eps-estimator/index.html',import.meta.url),'utf8'));
  assert.equal(embeddedSource(),fs.readFileSync(new URL('./embedded-sites.mjs',import.meta.url),'utf8'));
});

test('EPS apex returns independent site with owner-confirmed contact',async()=>{
  const res=await invoke('evercraftpropertyservices.com');
  assert.equal(res.status,200);
  assert.equal(res.headers.get('x-evercraft-frontdoor'),'embedded-static-no-legacy-upstream');
  const body=await res.text();
  assert.equal(body,EPS_HTML);
  assert.match(body,/tel:\+15097590440/);
  assert.match(body,/sms:\+15097590440/);
  assert.match(body,/jessegaethle10@gmail\.com/);
  assert.match(body,/evercraftpropertyservices@gmail\.com/);
});

test('HAVENLY apex returns separate correct phone and email',async()=>{
  const res=await invoke('havenlycleaning.com');
  assert.equal(res.status,200);
  const body=await res.text();
  assert.equal(body,HAVENLY_HTML);
  assert.match(body,/sms:\+15095605190/);
  assert.match(body,/havenlycleaning@gmail\.com/);
  assert.doesNotMatch(body,/15097590440/);
});

test('EPS estimator returns local interactive code without talking to Base44',async()=>{
  const res=await invoke('evercraftpropertyservices.com','/apps/eps-estimator/');
  assert.equal(res.status,200);
  assert.equal(res.headers.get('x-evercraft-service'),'eps-estimator');
  assert.equal(await res.text(),EPS_ESTIMATOR_HTML);
});

test('www redirects to apex preserving path, then stays away from Base44',async()=>{
  for(const host of ['www.evercraftpropertyservices.com','www.havenlycleaning.com']){
    const res=await invoke(host,'/quote?source=qr');
    assert.equal(res.status,308);
    assert.equal(res.headers.get('location'),'https://'+host.slice(4)+'/quote?source=qr');
  }
});

test('old links land on new site, not legacy services',async()=>{
  for(const domain of ['evercraftpropertyservices.com','havenlycleaning.com']){
    const res=await invoke(domain,'/legacy-booking?id=5');
    assert.equal(res.status,302);
    assert.equal(res.headers.get('location'),'/');
    const api=await invoke(domain,'/api/lead');
    assert.equal(api.status,404);
    assert.equal((await invoke(domain,'/admin')).status,404);
  }
  assert.equal((await invoke('evercraftpropertyservices.com','/contact')).headers.get('location'),'/#quote');
});

test('hostname gate and methods fail closed',async()=>{
  assert.equal((await invoke('donate.voteroman.com')).status,421);
  assert.equal((await invoke('attacker.example')).status,421);
  assert.equal((await invoke('evercraftpropertyservices.com','/','POST')).status,405);
  assert.equal((await invoke('havenlycleaning.com','/','HEAD')).status,200);
  assert.equal(await (await invoke('havenlycleaning.com','/','HEAD')).text(),'');
});

test('preview requires explicit configured host and service path',async()=>{
  const hostname='preview-shell.example.workers.dev';
  assert.equal((await invoke(hostname,'/eps/')).status,421);
  assert.equal((await invoke(hostname,'/')).status,421);
  const env={PREVIEW_HOSTS:hostname};
  assert.equal((await invoke(hostname,'/eps/', 'GET',env)).status,200);
  assert.equal((await invoke(hostname,'/havenly/', 'GET',env)).status,200);
  assert.equal((await invoke(hostname,'/eps/apps/eps-estimator/','GET',env)).status,200);
  assert.equal((await invoke(hostname,'/anything','GET',env)).status,421);
});

test('health is truthful about DNS and backend readiness',async()=>{
  const res=await invoke('evercraftpropertyservices.com','/_evercraft/health');
  const d=await res.json();
  assert.equal(d.state,'static_content_ready');
  assert.equal(d.base44_upstream,false);
  assert.equal(d.dns_cutover_verified,false);
  assert.equal(d.production_backend_verified,false);
  assert.equal(res.headers.get('cache-control'),'no-store');
});

test('no outbound network, secrets, remote HTML, Base44 fallback, or hidden customer data',async()=>{
  const source=fs.readFileSync(new URL('./worker.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|fetcher\(|base44\.app|\/api\/apps\//i);
  for(const html of [EPS_HTML,HAVENLY_HTML,EPS_ESTIMATOR_HTML]){
    assert.doesNotMatch(html,/@base44|base44Client|base44\.app|base44-prod/i);
  }
  assert.match(source,/frame-ancestors 'none'/);
  assert.match(source,/connect-src 'none'/);
});
