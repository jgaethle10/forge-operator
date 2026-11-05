import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SIGNAL_PILOT, prepareSignalInquiry } from '../public/signal/scope-request.mjs';

const data={
  incident: 'Savannah River laboratory fire',
  question: 'Which official statements disagree about the emergency timeline, and what documentation would resolve that discrepancy?',
  location: 'South Carolina',
  organization: 'Independent newsroom',
  source: 'https://public.srs.gov/2026/10/savannah-river-site-emergency-response-event/'
};
const html=fs.readFileSync(new URL('../public/signal/index.html',import.meta.url),'utf8');

test('pilot offer is one incident with no fictitious checkout',()=>{
  assert.equal(SIGNAL_PILOT.price_usd,250);
  assert.equal(SIGNAL_PILOT.payment_state,'scope_request_only_no_checkout');
  const request=prepareSignalInquiry(data);
  assert.equal(request.offer_id,SIGNAL_PILOT.id);
  assert.equal(request.state,'customer_draft_only_not_submitted');
  assert.equal(request.order_created,false);
  assert.equal(request.message_sent,false);
  assert.equal(request.checkout_available,false);
  assert.ok(request.mailto.startsWith('mailto:jessegaethle10@gmail.com?subject='));
  assert.ok(decodeURIComponent(request.mailto).includes('Savannah River laboratory fire'));
  assert.ok(request.body.includes('final price and an official matching payment route'));
});

test('the landing page presents real deliverables, price and an actual editable request',()=>{
  assert.match(html,/Incident Evidence Brief/);
  assert.match(html,/\$250/);
  assert.match(html,/id="signal-inquiry"/);
  assert.match(html,/name="incident"/);
  assert.match(html,/name="question"/);
  assert.match(html,/type="module"/);
  assert.match(html,/scope-request\.mjs/);
  assert.match(html,/nothing is sent automatically/);
  assert.match(html,/not an active checkout/);
  assert.ok(!html.includes('Ask about organizational monitoring'));
});

test('empty or overlong scope fields fail closed',()=>{
  assert.throws(()=>prepareSignalInquiry({...data,incident:'x'}),/Incident or facility/);
  assert.throws(()=>prepareSignalInquiry({...data,question:'why?'}),/Decision or evidence question/);
  assert.throws(()=>prepareSignalInquiry({...data,question:'a'.repeat(501)}),/Decision or evidence question/);
  assert.throws(()=>prepareSignalInquiry({...data,location:'x'.repeat(121)}),/Location/);
});

test('headers cannot be customer-overridden with newline injection',()=>{
  const req=prepareSignalInquiry({...data,incident:'Example\r\nBcc:bad@example.com'});
  assert.equal(req.subject,'Evercraft Signal | $250 Incident Evidence Brief | Scope request');
  assert.ok(!req.body.includes('\r'));
  assert.ok(req.body.includes('Example Bcc:bad@example.com'));
});

test('private or credential-bearing URLs do not pass as source evidence',()=>{
  for(const source of ['http://example.com','https://localhost/','https://10.0.0.1/admin','https://user:pw@example.com/']){
    assert.throws(()=>prepareSignalInquiry({...data,source}),/Source/);
  }
});

test('buyer request is not a hazardous exposure claim or emergency service',()=>{
  const req=prepareSignalInquiry(data);
  assert.ok(req.body.includes('source-linked timeline'));
  assert.ok(req.body.includes('not a paid order'));
  assert.match(html,/not live monitoring, radiation testing, legal advice, or an emergency alert/);
});
