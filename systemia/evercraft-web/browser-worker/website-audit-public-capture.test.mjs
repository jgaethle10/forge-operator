import test from 'node:test';
import assert from 'node:assert/strict';
import {admitRequest,pageEvidence,ORIGIN,OFFER_PATH} from './website-audit-public-capture.mjs';

test('public offer scope permits same-origin reads and refuses transactions, external sites and local files',()=>{
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'GET').allowed,true);
  assert.equal(admitRequest(ORIGIN+'/assets/style.css','HEAD').allowed,true);
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'POST').reason,'non_read_method');
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'DELETE').allowed,false);
  assert.equal(admitRequest('https://evil.example.com/a','GET').reason,'off_origin_asset');
  assert.equal(admitRequest('http://fabric.systemiacommandcenters.com','GET').allowed,false);
  assert.equal(admitRequest('file:///etc/passwd','GET').allowed,false);
  assert.equal(admitRequest('not-a-url','GET').allowed,false);
});
test('public page observation never verifies checkout, payment, audit runtime or publication',()=>{
  const result=pageEvidence({httpStatus:200,title:'Systemia Website Audit',heading:'Website Audit',
    hasEmailField:true,hasCheckoutButton:true,pageErrorCount:0});
  assert.equal(result.state,'public_offer_observed');
  assert.equal(result.checkoutActionPerformed,false);
  assert.equal(result.paymentVerified,false);
  assert.equal(result.fulfillmentVerified,false);
  assert.equal(result.actualAuditWorkflowCaptured,false);
  assert.equal(result.publicationAuthority,false);
});
test('unhealthy public offer cannot be presented as a verified product demonstration',()=>{
  for(const change of [{httpStatus:503},{title:'Missing',heading:'Not found'},
    {hasEmailField:false},{hasCheckoutButton:false},{pageErrorCount:1}]){
    const r=pageEvidence({...{httpStatus:200,title:'Website Audit',heading:'Website Audit',
      hasEmailField:true,hasCheckoutButton:true,pageErrorCount:0},...change});
    assert.equal(r.state,'blocked');
    assert.ok(r.problems.length);
    assert.equal(r.paymentVerified,false);
  }
});
