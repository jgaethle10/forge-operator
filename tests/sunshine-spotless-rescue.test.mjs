import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Sunshine & Spotless page is independent, customer-directed and non-transactional',()=>{
 const page=read('public/sunshine-spotless/index.html');
 assert.match(page,/sunshine-spotless-continuity-20261018/);
 assert.match(page,/Sunshine &amp; Spotless/);
 for(const contact of ['sms:+15099309415','tel:+15099309415','mailto:sunshineandspotlesscleaningco@gmail.com'])assert.ok(page.includes(contact));
 assert.doesNotMatch(page,/base44[.]app|@base44|base44Client|base44-prod|5099103256|sms:\+15095605190/i);
 assert.match(page,/This page does not submit your details to a database or book an appointment/);
 assert.match(page,/No payment is taken here/);
 assert.doesNotMatch(page,/<form[^>]*action=/i);
});
test('Read-only Sunshine & Spotless migration state is bounded and without private records',()=>{
 const state=JSON.parse(read('systemia/migrations/base44-exit/sunshine-spotless-recovery-state.json'));
 assert.equal(state.business,'Sunshine & Spotless Cleaning Co');
 assert.equal(state.legacy_read_only_entity_counts.Lead,11);
 assert.equal(state.legacy_read_only_entity_counts.Review,3);
 assert.equal(state.legacy_read_only_entity_counts.Testimonial,3);
 assert.equal(state.customer_data_extraction,'not_performed');
 assert.equal(state.customer_data_reconciliation,'not_performed');
 assert.equal(state.server_side_intake,'not_connected');
 assert.equal(state.external_domain_redirect_state,'not_verified_not_cut_over');
});
