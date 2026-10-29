import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../public/mesh/checkout-ready/',import.meta.url);
const read=x=>readFileSync(new URL(x,root),'utf8');
const items=[
 {slug:'social-media-weekly',name:'Weekly Social Media Management',price:100,checkout:'https://buy.stripe.com/4gM3cweaOcwJ1Za1I84AU0d'},
 {slug:'asset-diagnosis',name:'Asset Diagnosis',price:149,checkout:'https://buy.stripe.com/dRm9AU0jYdANdHS72s4AU0a'},
 {slug:'ai-boardroom-standard',name:'AI Boardroom Standard Review',price:250,checkout:'https://buy.stripe.com/14AdRaaYC68lcDO0E44AU08'},
 {slug:'ai-boardroom-financial-modeling',name:'AI Boardroom Deep Dive with Financial Modeling',price:500,checkout:'https://buy.stripe.com/3cIbJ2feSfIVcDO1I84AU09'}
];
test('four branded service pages preserve verified Stripe product and price identity',()=>{
 const dir=read('index.html');
 const sitemap=read('sitemap.xml');
 const llms=read('llms.txt');
 for(const p of items){
  const html=read(p.slug+'/index.html');
  const canonical='https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/'+p.slug+'/';
  assert.ok(dir.includes('href="./'+p.slug+'/"'),p.slug);
  assert.ok(sitemap.includes('<loc>'+canonical+'</loc>'),p.slug);
  assert.ok(llms.includes(canonical),p.slug);
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'));
  assert.ok(html.includes(p.checkout));
  assert.ok(html.includes('$'+p.price));
  assert.match(html,/<meta name="robots" content="index,follow">/);
  assert.match(html,/Confirm scope by email/);
  assert.match(html,/scope and delivery schedule/);
  assert.match(html,/authoritative provider-paid receipt/);
  assert.doesNotMatch(html,/(pornhub|onlyfans|fansly|sex toys|RIVET|AliEV)/i);
  const scripts=html.match(/<script>([\s\S]*?)<\/script>/g)||[];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new vm.Script(scripts[0].slice(8,-9)));
  const urls=(html.match(/https:\/\/buy\.stripe\.com\/[a-zA-Z0-9]+/g)||[]);
  assert.ok(urls.length>=2);
  assert.deepEqual([...new Set(urls)],[p.checkout]);
 }
});
test('publisher directory does not silently offer mismatched low-cost PDFs or audit',()=>{
 const checkout=read('index.html');
 const manifest=JSON.parse(read('verified-links.json'));
 const forbidden=['Garage Field Notes PDF products','FindMyPart Quick Hunt','Website Quick Win Audit'];
 assert.deepEqual(manifest.forbidden_substitutions,forbidden);
 assert.deepEqual(items.map(x=>x.price*100),manifest.links.slice(0,4).map(x=>x.amount_cents));
 assert.deepEqual(manifest.links.slice(4).map(x=>x.amount_cents),[50000,100000,150000]);
 assert.ok(!items.some(x=>[7,9,19,49].includes(x.price)));
 assert.match(checkout,/Ready to review your checkout\?/);
 assert.doesNotMatch(checkout,/checked\?'false':'true'/);
 assert.doesNotMatch(checkout,/getElementById\('accept'\)/);
 assert.match(checkout,/confirm project scope and delivery availability/i);
 assert.match(checkout,/Opening checkout does not itself place an order/i);
 for(const item of manifest.links) assert.ok(checkout.includes('href="'+item.url+'"'));

});
