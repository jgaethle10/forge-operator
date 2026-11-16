import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Script } from 'node:vm';

const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('EPS email-first customer quote does not link to disconnected business phone',()=>{
 const html=read('public/eps/index.html');
 assert.match(html,/mailto:jessegaethle10@gmail\.com/);
 assert.match(html,/type="email" autocomplete="email"/);
 assert.match(html,/id="replyEmail"/);
 assert.match(html,/name, location, and project type/);
 assert.match(html,/Please press Send in your email app/i);
 assert.doesNotMatch(html,/href="(?:tel:|sms:)|Call \(509\)|759-0440|910-3256/i);
 assert.doesNotMatch(html,/havenlycleaning@gmail\.com|havenlycleaning\.com|Havenly Cleaning/i);
 const snippets=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(snippets.length,1);
 assert.doesNotThrow(()=>new Script(snippets[0][1]));
});

test('EPS links resolve on both GitHub Pages project base and custom domain',()=>{
 const html=read('public/eps/index.html');
 const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(hrefs.includes('../apps/eps-estimator/'));
 assert.ok(hrefs.includes('../contact/'));
 assert.ok(hrefs.includes('./'));
 for(const base of ['https://jgaethle10.github.io/forge-operator/eps/','https://evercraftpropertyservices.com/']){
   const estimator=new URL('../apps/eps-estimator/',base);
   const contact=new URL('../contact/',base);
   const current=new URL('./',base);
   if(base.includes('github.io')){
     assert.equal(estimator.pathname,'/forge-operator/apps/eps-estimator/');
     assert.equal(contact.pathname,'/forge-operator/contact/');
     assert.equal(current.pathname,'/forge-operator/eps/');
   }else{
     assert.equal(estimator.pathname,'/apps/eps-estimator/');
     assert.equal(contact.pathname,'/contact/');
     assert.equal(current.pathname,'/');
   }
 }
});

test('EPS embedded edge remains identical; Nikki HAVENLY routes are unchanged',async()=>{
 const {EPS_HTML,HAVENLY_HTML}=await import('../infra/evercraft-edge/service-frontdoor/embedded-sites.mjs');
 assert.equal(EPS_HTML,read('public/eps/index.html'));
 assert.equal(HAVENLY_HTML,read('public/havenly/index.html'));
 assert.match(HAVENLY_HTML,/mailto:havenlycleaning@gmail\.com/);
 assert.match(HAVENLY_HTML,/tel:\+15095605190/);
 assert.match(HAVENLY_HTML,/sms:\+15095605190/);
 assert.doesNotMatch(HAVENLY_HTML,/mailto:jessegaethle10@gmail\.com/);
});
