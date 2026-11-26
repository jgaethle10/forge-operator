import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
test('University retains bounded proving and verification gates',()=>{
 const entry=read('public/chum/products/systemia-university/ai-conformance.json');
 const registry=fs.readFileSync('registry/systemia-university/README.md','utf8');
 const manifest=read('public/benchmarks/systemia-university/manifest.json');
 assert.equal(entry.product_key,'systemia-university');
 assert.equal(entry.human_confirmation_required,true);
 assert(entry.boundaries.some(x=>x.includes('provisional evidence is not verified')));
 assert(entry.boundaries.some(x=>x.includes('human-reviewed')));
 assert(entry.boundaries.some(x=>x.includes('do not authorize contacting people')));
 assert.match(registry,/public proofs and workforce profiles must be explicitly approved/);
 assert(manifest&&typeof manifest==='object');
 assert.equal(entry.commercial,null);
});
