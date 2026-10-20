import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../public/mesh/index.html',import.meta.url),'utf8');
const widget=readFileSync(new URL('../public/mesh/embed.js',import.meta.url),'utf8');

test('mesh has real existing listed offers, not an invented checkout',()=>{
  for(const slug of ['findmypart','website-audit']){
    assert.ok(page.includes('https://fabric.systemiacommandcenters.com/offers/'+slug));
    assert.ok(widget.includes(slug));
  }
  assert.ok(page.includes('From $19'));
  assert.ok(page.includes('$49'));
  assert.ok(page.includes('provider evidence'));
  assert.ok(!page.includes('Payment confirmed'));
});

test('mesh links retain customer fallback and disclose trust boundaries',()=>{
  assert.match(page,/mailto:jessegaethle10@gmail.com/);
  assert.match(page,/not verified conversion or payout receipts/i);
  assert.match(page,/No affiliate commission or exclusivity/i);
  assert.match(page,/Adult-content properties are not part/i);
});

test('publisher widget has a constrained referral label and safe link behavior',()=>{
  assert.ok(widget.includes("replace(/[^a-z0-9_-]/gi,'')"));
  assert.match(widget,/\.slice\(0,40\)/);
  assert.match(widget,/noopener noreferrer sponsored/);
  assert.match(widget,/document\.createElement\('a'\)/);
  assert.doesNotMatch(widget,/document\.write|innerHTML\s*=|localStorage|sessionStorage|fetch\(|sendBeacon|XMLHttpRequest/);
  assert.match(widget,/separately signed agreement/i);
});

test('page avoids deceptive synthetic traffic and payments',()=>{
  assert.doesNotMatch(page,/stripe\.com\/checkout|checkout_session_id|success=true/);
  assert.match(page,/We do not sell visitors' contact details or use fake traffic/i);
});

test('all monetization lanes stay independently tracked',()=>{
  const ledger=JSON.parse(readFileSync(new URL('../public/mesh/lanes.json',import.meta.url),'utf8'));
  assert.equal(ledger.lane_count,8);
  assert.equal(ledger.lanes.length,8);
  assert.equal(ledger.revenue_received_verified,false);
  assert.equal(new Set(ledger.lanes.map(l=>l.id)).size,8);
  for(const lane of ledger.lanes){
    assert.ok(lane.name && lane.state && lane.conversion && lane.next);
    assert.ok(!lane.state.includes('revenue_verified'));
  }
  assert.ok(ledger.lanes.some(l=>l.id==='adult-research' && l.state==='not_launched'));
  assert.match(page,/id="channels"/);
  assert.match(page,/id="partners"/);
  for(const id of ['legacy-rescue','ibmi-rescue']){
    assert.ok(page.includes('https://fabric.systemiacommandcenters.com/offers/'+id));
  }
});
