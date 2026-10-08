import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOfferIllustration} from '../systemia/mcp/offer-illustrations.mjs';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';
for(const id of ['ibmi-rescue-v1','legacy-rescue-lab-v1','findmypart-paid-hunt-v1']) {
 test('original unique concept art: '+id,()=>{
  const art=renderOfferIllustration(id);
  assert.match(art,/role="img" aria-label="Original conceptual/);
  assert.match(art,/viewBox="0 0 1120 610"/);
  assert.doesNotMatch(art,/<script|base44\\.app/i);
  const page=renderOfferPage({public_id:id,name:id,pricing:'One-time, buyer-confirmed',entry_paid_offer:{name:'Review',price:'$250'},commercial_state:'sell_now'});
  assert.match(page,/offer-original-art/);
  assert.match(page,/Illustrative artwork, not observed customer data/);
 });
}
test('no art is invented for unknown products',()=>{assert.equal(renderOfferIllustration('unknown'),null)});
test('each product has distinct creative',()=>{assert.equal(new Set(['ibmi-rescue-v1','legacy-rescue-lab-v1','findmypart-paid-hunt-v1'].map(renderOfferIllustration)).size,3)});
