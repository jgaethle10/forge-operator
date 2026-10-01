import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildRivetPublicMailPlan,assertRivetPublicMailPlan} from './rivet-public-mail.mjs';

const manifest=JSON.parse(await fs.readFile(new URL('./rivet-mailboxes.json',import.meta.url),'utf8'));
const plan=buildRivetPublicMailPlan({domain:'rivet.example',mailboxes:manifest.mailboxes});
assert.equal(plan.ready_for_dns_mail_promotion,true);
assert.equal(plan.default_invoice_sender,'invoices@rivet.example');
assert.deepEqual(plan.staff_addresses,[
  'paola@rivet.example',
  'daryl@rivet.example',
  'jess@rivet.example',
  'jesse@rivet.example',
]);
assert.equal(plan.public_addresses.some(x=>/evercraft|systemia|base44/.test(x.public_address)),false);
assertRivetPublicMailPlan(plan);

for(const forbidden of ['rivet.systemiacommandcenters.com','rivet.evercraft.app','rivet.base44.app']){
  assert.throws(
    ()=>buildRivetPublicMailPlan({domain:forbidden,mailboxes:manifest.mailboxes}),
    /rivet_public_domain_leaks_parent_brand/
  );
}
assert.throws(
  ()=>buildRivetPublicMailPlan({domain:'rivet',mailboxes:manifest.mailboxes}),
  /public_dns_domain_required/
);
console.log('RIVET public mail identity proof passed');
