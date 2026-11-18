import test from 'node:test';
import assert from 'node:assert/strict';
import {qualify,draftOffer,processEntries,OFFER_URL} from '../scripts/penguin-revenue-desk.mjs';
const good={company:'Example Roofing',site:'https://example.com/',contact_name:'Taylor',contact_email:'hello@example.com',observations:[{issue:'unclear_primary_offer',evidence:'The homepage displays three equally prominent services before a clear request-a-quote action.',source:'https://example.com/',checked_at:'2026-11-18'}]};
test('qualifies first-party dated evidence without inventing a conversion claim',()=>{
 const result=qualify(good);assert.equal(result.ok,true);
 assert.equal(result.record.stage,'needs_human_review');
 const draft=draftOffer(result.record);
 assert.match(draft.body,/I haven't measured your conversion rate/);
 assert.ok(draft.body.includes(OFFER_URL));
 assert.equal(draft.send_authorized,false);
});
test('rejects unsupported claims',()=>{
 assert.equal(qualify({...good,observations:[]}).ok,false);
 assert.equal(qualify({...good,observations:[{...good.observations[0],source:'https://other.com/'}]}).ok,false);
 assert.equal(qualify({...good,site:'http://example.com'}).ok,false);
 assert.equal(qualify({...good,observations:[{...good.observations[0],issue:'made_up_problem'}]}).ok,false);
});
test('deduplicates same-site opportunities and does not imply revenue',()=>{
 const result=processEntries([good,{...good,company:'Example Again'}]);
 assert.equal(result.qualified.length,1);assert.equal(result.rejected[0].reason,'duplicate_site');
 assert.equal(result.qualified[0].sent,false);assert.equal(result.qualified[0].payment_status,'not_checked');
});
test('rejects oversized batches',()=>assert.throws(()=>processEntries(Array.from({length:201},()=>good))));
