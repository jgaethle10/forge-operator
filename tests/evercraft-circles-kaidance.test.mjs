import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
test('Circles has a canonical identity and explicit human onboarding boundaries',()=>{
 const entry=read('public/chum/products/evercraft-circles/ai-conformance.json');
 const catalog=read('registry/public-products.json');
 assert.equal(entry.product_key,'evercraft-circles');
 assert.equal(entry.human_confirmation_required,true);
 assert.match(entry.authority,/human-directed onboarding/);
 assert(entry.boundaries.some(x=>x.includes('private member profiles')));
 assert(entry.boundaries.some(x=>x.includes('user-directed')));
 assert(entry.boundaries.some(x=>x.includes('external introductions')));
 assert(catalog.products.some(p=>p.product_key==='evercraft-circles'));
 assert.equal(entry.live_canary_evidence,null);
 assert.equal(entry.commercial,null);
});
test('Circles discovery is not mistaken for live paid member/referral service',()=>{
 const html=fs.readFileSync('public/chum/products/evercraft-circles/index.html','utf8');
 const docs=fs.readFileSync('registry/evercraft-circles/README.md','utf8');
 assert.match(html,/Evercraft Circles/);
 assert.match(docs,/not proof that a named AI provider/);
 assert.match(docs,/private member profiles/);
 assert.match(docs,/Human confirmation required: yes/);
});
