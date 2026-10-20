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
  assert.match(widget,/replace\(\/\[\^a-z0-9_-\]\/gi,'\'\)/);
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
