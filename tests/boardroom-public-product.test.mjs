import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const html=read('public/mesh/ai-boardroom/index.html');
const discovery=JSON.parse(read('public/mesh/ai-boardroom/ai-discovery.json'));
test('Boardroom public offer pages exist and free compare is not an imaginary demo',()=>{
 assert.match(html,/<main id="content">/);
 for(const href of ['./compare/','../checkout-ready/ai-boardroom-standard/','../checkout-ready/ai-boardroom-financial-modeling/'])assert.ok(html.includes('href="'+href+'"'),href);
 for(const path of ['public/mesh/ai-boardroom/compare/index.html','public/mesh/ai-boardroom/compare/engine.mjs','public/mesh/checkout-ready/ai-boardroom-standard/index.html','public/mesh/checkout-ready/ai-boardroom-financial-modeling/index.html'])assert.ok(read(path).length>500,path);
});
test('Visible prices and service boundaries match authoritative published product records',()=>{
 assert.deepEqual(discovery.variants.map(v=>v.price_usd).sort((a,b)=>a-b),[250,500]);
 for(const amount of ['$0','$250','$500'])assert.ok(html.includes(amount),amount);
 assert.match(html,/\$9 automated product is not currently for sale/);
 assert.match(html,/not been independently reverified/);
 assert.doesNotMatch(html,/trusted by thousands|guaranteed earnings|running live multi-model session/i);
});
test('Metadata describes actual local tool and scoped paid services',()=>{
 const s=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 assert.ok(s);
 const data=JSON.parse(s[1]);
 assert.equal(data['@context'],'https://schema.org');
 const app=data['@graph'].find(x=>x['@type']==='SoftwareApplication');
 const service=data['@graph'].find(x=>x['@type']==='Service');
 assert.equal(app.offers.price,0);
 assert.deepEqual(service.offers.map(x=>Number(x.price)),[250,500]);
 assert.match(html,/It does not call any model/);
 assert.match(html,/Not a live agent run/);
});
test('No external JavaScript or tracking on customer landing page',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>/g)].map(x=>x[0]);
 assert.equal(scripts.length,1);
 assert.ok(scripts[0].includes('application/ld+json'));
 assert.doesNotMatch(html,/https?:\/\/[^\s"']+\.(?:js|css)/);
});
