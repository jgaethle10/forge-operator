import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFirstOfferBuyerResearch} from './ibmi-first-buyer-research.mjs';
const pack=JSON.parse(fs.readFileSync(new URL('./ibmi-public-buyer-observations-2026-10-07.json',import.meta.url),'utf8'));
test('use actual IBM i buyer research classifier with public source provenance',()=>{
 const r=buildFirstOfferBuyerResearch(pack);
 assert.equal(r.source_count,3);
 assert.equal(r.queue.length,3);
 assert.equal(r.verified_buyer_count,0);
 assert.equal(r.automatic_outreach_allowed,false);
 assert.ok(r.queue.some(x=>x.company==='ECHO Incorporated'&&x.buyer_intent_unverified));
});
test('recruitment agency and unrelated major RFP are not direct audit leads',()=>{
 const r=buildFirstOfferBuyerResearch(pack);
 assert.equal(r.queue.find(x=>x.company.includes('HRize')).queue_state,'hold');
 assert.equal(r.queue.find(x=>x.company.includes('Bermuda')).queue_state,'hold');
 assert.equal(r.observations.every(x=>x.direct_purchase_intent_confirmed===false),true);
 assert.equal(r.observations.every(x=>x.outreach_state==='not_authorized'),true);
});
test('public posting does not identify customer's installed IBM i 7.4 release',()=>{
 const r=buildFirstOfferBuyerResearch(pack);
 assert.equal(r.queue.every(x=>x.release_7_4_unverified),true);
});
