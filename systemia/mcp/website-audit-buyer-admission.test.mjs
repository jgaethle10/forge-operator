import test from 'node:test';
import assert from 'node:assert/strict';
import {admitAuditBuyer,auditWebsiteHost,normalizeAuditEmail} from './website-audit-buyer-admission.mjs';

test('public HTTPS targets and email normalize for checkout custody',()=>{
  const r=admitAuditBuyer({customer_ref:' BUYER@Example.ORG ',website_url:'https://www.business.org/contact'});
  assert.deepEqual(r,{ok:true,customer_ref:'buyer@example.org',website_url:'https://business.org/',audited_domain:'business.org'});
  assert.equal(auditWebsiteHost('business.org'),'business.org');
  assert.equal(normalizeAuditEmail('buyer@business.org'),'buyer@business.org');
});
test('missing email and invalid targets fail before Raven',()=>{
  assert.deepEqual(admitAuditBuyer({website_url:'https://business.org'}),{ok:false,reason:'attributable_customer_email_required'});
  assert.deepEqual(admitAuditBuyer({customer_ref:'buyer@business.org',website_url:'localhost'}),{ok:false,reason:'public_https_website_required'});
  for(const input of ['http://business.org','https://127.0.0.1','https://192.168.1.1','https://metadata.google.internal','https://[::1]','https://business.org:444','https://a.invalid','https://foo.test','https://business.org@127.0.0.1','file:///etc/passwd','https://bad..org','https://0x7f000001']){
    assert.equal(auditWebsiteHost(input),'',input);
  }
});
