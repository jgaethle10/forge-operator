import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {test} from 'node:test';

const html=fs.readFileSync('public/clients/on-the-go/review/index.html','utf8');

test('Client 001 V4 remains branded, private-review only and first-party',()=>{
 assert.match(html,/<title>On The Go Mobile Quick Lube \| Client Preview V4<\/title>/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/--navy:#0b2342/);
 assert.match(html,/--green:#3bd275/);
 assert.match(html,/JUAN BELLO/);
 assert.match(html,/509-833-5025/);
 assert.match(html,/tel:\+15098335025/);
 assert.match(html,/mailto:onthegomobileoilchange@outlook\.com/);
 assert.match(html,/Not a live booking service/);
 assert.match(html,/Full synthetic \+ tire rotation/);
 const embedded=[...html.matchAll(/data:image\/jpeg;base64,([a-zA-Z0-9+/=]+)/g)];
 assert.equal(embedded.length,4,'only existing authorized commercial photos are present');
 for(const [,b64] of embedded){const img=Buffer.from(b64,'base64');assert.equal(img[0],0xff);assert.equal(img[1],0xd8);assert.ok(img.length>10000);}
 assert.equal((html.match(/data-service="/g)||[]).length,8,'all eight source-published services remain selectable');
 assert.equal((html.match(/<details>/g)||[]).length,4,'four FAQ answers');
 for(const price of ['$74.99','$99.99','$120.99','$35.99','$49.99','$70.00']) assert.ok(html.includes(price),'missing '+price);
 assert.match(html,/Monday–Friday · 9 AM–5 PM/);
 assert.doesNotMatch(html,/<script[^>]*src\s*=/i);
 assert.doesNotMatch(html,/\bfetch\s*\(|\bXMLHttpRequest\b|\bnavigator\.sendBeacon\b/);
 assert.doesNotMatch(html,/gtag\(|facebook\.com\/tr\/|refCode|beaconTitle|EC-DIRECT-001/i);
});

test('client-side package match is correct, bilingual, email handoff has no technical tags',()=>{
 const src=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(src);
 const elements=new Map(), events=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',href:'',checked:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(type,cb){events.set(id+':'+type,cb)},scrollIntoView(){}});return elements.get(id)};
 const hero=get('hero1');hero.dataset.i18n='hero1';
 const full=get('fullButton');full.dataset.service='full';
 const radios=['semi','full','client'].map((value,i)=>({value,checked:i===0,addEventListener(type,cb){events.set('radio:'+value+':'+type,cb)}}));
 const document={documentElement:{lang:'en'},getElementById:get,querySelector(sel){if(sel==='input[name="oil"]:checked')return radios.find(x=>x.checked);return null;},querySelectorAll(sel){if(sel==='[data-i18n]')return[hero];if(sel==='[data-bi]')return[];if(sel==='[data-service]')return[full];if(sel==='input[name="oil"]')return radios;return[]}};
 const window={matchMedia(){return {matches:true}}};
 vm.runInNewContext(src,{document,window}, {timeout:2500});
 assert.equal(get('matchResultPrice').textContent,'$74.99');
 const cases=[['semi',false,'$74.99'],['semi',true,'$99.99'],['full',false,'$99.99'],['full',true,'$120.99'],['client',false,'$49.99'],['client',true,'$70.00']];
 for(const [oil,tire,price] of cases){
  for(const r of radios)r.checked=r.value===oil;
  events.get('radio:'+oil+':change')();
  get('matchTires').checked=tire;events.get('matchTires:change')();
  assert.equal(get('matchResultPrice').textContent,price,`wrong price ${oil}/${tire}`);
 }
 for(const lang of ['en','es']){
  events.get(lang+':click')();
  assert.equal(document.documentElement.lang,lang);
  for(const [oil,tire,price] of cases){
   for(const r of radios)r.checked=r.value===oil;
   events.get('radio:'+oil+':change')();
   get('matchTires').checked=tire;events.get('matchTires:change')();
   events.get('matchAsk:click')();
   assert.equal(get('matchResultPrice').textContent,price);
   const body=decodeURIComponent(get('emailCta').href);
   assert.match(body,/mailto:onthegomobileoilchange@outlook\.com/);
   assert.doesNotMatch(body,/EC-DIRECT|EVERCRAFT|referral|campaña|referencia/i);
   if(lang==='es')assert.match(body,/Me interesa: /);else assert.match(body,/Interested in: /);
  }
 }
});