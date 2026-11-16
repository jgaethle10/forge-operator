import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFabricCatalogFromRepository,matchFabricCapabilities}
 from '../systemia/mcp/fabric-directory.mjs';

const catalog=loadFabricCatalogFromRepository();
const ids=(q)=>matchFabricCapabilities(q,catalog,{limit:5}).map(x=>x.public_id);

test('a stranger asking about winter home maintenance sees property help first',()=>{
 const hits=ids("I'm a homeowner in Yakima. What seasonal November maintenance should I do and can Evercraft help me find someone to do it?");
 assert.equal(hits[0],'product:evercraft-property-services');
 assert.ok(hits.includes('product:seasonally'));
 assert.ok(hits.includes('product:contractor-cloud'));
 assert.ok(!hits.slice(0,3).includes('ibmi-rescue-v1'));
});

test('broad free everyday help is routed to the public front door, not paid diagnostics',()=>{
 const hits=ids('What can @Evercraft do for my everyday life here in Yakima? I want free or inexpensive practical help.');
 assert.equal(hits[0],'product:evercraft-front-door');
});

test('an explicit IBM i rescue problem is not mistaken for home maintenance',()=>{
 const hits=ids('I am working at home and need to rescue our IBM i legacy software server');
 assert.ok(['ibmi-rescue-v1','legacy-rescue-lab-v1'].includes(hits[0]));
 assert.ok(!hits[0].startsWith('product:'));
});

test('named paid and specialist capabilities retain their current ranking and purchase boundaries',()=>{
 const forensics=ids('I have a six hour video too large for ChatGPT and need a timestamped transcript, key moments and duplicate-segment review');
 assert.equal(forensics[0],'forensiscope-evidence-review-v1');
 const earthworks=ids('Our quarry haul trucks keep stacking up at the loader and then the loader sits waiting. We want to simulate the load haul dump loop and shadow dispatch before buying autonomous equipment.');
 assert.equal(earthworks[0],'earthworks-site-autonomy-study-v1');
 const home=matchFabricCapabilities('What seasonal November home maintenance should I do?',catalog,{limit:5});
 assert.ok(home.every(x=>x.public_id.startsWith('product:')?x.entry_paid_offer===null:true));
});
