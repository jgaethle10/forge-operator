import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const id='ai-boardroom-decision-review-v1';
test('generated public capability directory includes the Boardroom with no instant paid action',()=>{
 const index=read('public/chum/capabilities.json');
 const b=index.capabilities.find(x=>x.public_id===id);
 assert.ok(b,'Boardroom missing from generated CHUM capabilities index');
 assert.equal(index.capabilities.filter(x=>x.public_id===id).length,1);
 assert.equal(b.commercial_state,'discovery_only');
 assert.equal(b.machine_state,'source_discovery_only');
 assert.equal(b.entry_paid_offer,null);
 assert.equal(b.start_url,null);
 assert.equal(b.public_url,'https://jgaethle10.github.io/forge-operator/mesh/ai-boardroom/');
 assert.equal(b.page_url,'/chum/capabilities/'+id+'/');
});
test('generated Boardroom record preserves source claims, free scope and privacy',()=>{
 const entry=read('public/chum/capabilities/'+id+'/capability.json');
 const guide=fs.readFileSync('public/chum/capabilities/'+id+'/llms.txt','utf8');
 assert.equal(entry.public_id,id);
 assert.equal(entry.machine_state,'source_discovery_only');
 assert.equal(entry.live_canary_evidence,null);
 assert.equal(entry.entry_paid_offer,null);
 assert.equal(entry.start_url,null);
 assert.deepEqual(entry.offers,[]);
 assert.match(entry.invocation_status,/no verified automatic multi-LLM/i);
 assert.match(guide,/no instant \$9 paid SKU/i);
 assert.ok(entry.use_when.some(x=>x.includes('ChatGPT and Claude')));
});
test('Boardroom discovery overlay must not edit canonical machine commerce product authority',()=>{
 const machine=read('public/.well-known/evercraft-machine-catalog.json');
 assert.ok(!machine.offers.some(x=>x.public_id===id));
});
