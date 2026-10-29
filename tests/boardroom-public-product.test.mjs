import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildReport} from '../public/mesh/ai-boardroom/compare/engine.mjs';
const base=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,base),'utf8');
const page=read('public/mesh/ai-boardroom/index.html');
const discovery=JSON.parse(read('public/mesh/ai-boardroom/ai-discovery.json'));
test('actual customer starting tools exist and no paid model calls are implied',()=>{
 for(const s of ['id="decision"','id="build"','id="brief"','id="copy-brief"','id="download-brief"','href="./compare/"','href="../checkout-ready/ai-boardroom-standard/"','href="../checkout-ready/ai-boardroom-financial-modeling/"'])assert.ok(page.includes(s),s);
 assert.ok(read('public/mesh/ai-boardroom/compare/index.html').includes('engine.mjs'));
 assert.ok(read('public/mesh/ai-boardroom/compare/engine.mjs').includes('buildReport'));
 assert.match(page,/not an AI-generated verdict/i);
 assert.match(page,/does not contact remote AI services/i);
});
test('pricing agrees with canonical public discovery and exact service doors',()=>{
 assert.deepEqual(discovery.variants.map(x=>x.price_usd).sort((a,b)=>a-b),[250,500]);
 for(const price of ['$0','$250','$500'])assert.ok(page.includes(price),price);
 assert.match(page,/require scope, capacity, and delivery terms/i);
 assert.match(page,/not represented as automated/i);
 assert.doesNotMatch(page,/live multi-model council (is|now)|thousands of customers|guaranteed returns/i);
 for(const p of ['ai-boardroom-standard','ai-boardroom-financial-modeling'])assert.match(read('public/mesh/checkout-ready/'+p+'/index.html'),/Stripe checkout/i);
});
test('metadata and browser-only code have valid syntax and no external JavaScript',()=>{
 const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,2);
 assert.match(scripts[0][1],/application\/ld\+json/);
 const schema=JSON.parse(scripts[0][2]);
 assert.equal(schema['@context'],'https://schema.org');
 assert.deepEqual(schema.offers.map(x=>Number(x.price)),[250,500]);
 assert.doesNotThrow(()=>new vm.Script(scripts[1][2]));
 assert.doesNotMatch(page,/<script[^>]+src=/);
 assert.doesNotMatch(scripts[1][2],/\bfetch\(|\bXMLHttpRequest\b/);
});
test('download and clipboard use the same question-only brief formatter',()=>{
 assert.match(page,/function makeBriefText\(\)/);
 assert.match(page,/const txt=makeBriefText\(\)/);
 assert.match(page,/new Blob\(\[makeBriefText\(\)\]/);
 assert.match(page,/evercraft-boardroom-decision-brief\.txt/);
 assert.match(page,/a\.download=/);
});
test('pasted model comparison is conservative and labels unknowns honestly',()=>{
 const result=buildReport({question:'Should we launch next month?',answers:[{label:'Advisor 1',text:'I recommend launching next month with a small controlled pilot to test demand.'},{label:'Advisor 2',text:'Do not launch next month. Confirm the support team can handle the workload before proceeding.'}]});
 assert.equal(result.answers.length,2);
 assert.equal(result.disagreement,true);
 assert.match(result.reportText,/No AI models were contacted/);
 assert.ok(result.questions.length>=2);
});
