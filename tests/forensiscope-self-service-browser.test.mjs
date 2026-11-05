import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FORENSISCOPE_OFFERS} from '../systemia/forensiscope/commercial-offers.mjs';

const root=new URL('../public/forensiscope/self-service/',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const script=fs.readFileSync(new URL('app.mjs',root),'utf8');
const snapshot=JSON.parse(fs.readFileSync(new URL('tiers.json',root),'utf8'));

test('browser tier snapshot exactly equals authoritative ForensiScope prices',()=>{
  assert.equal(snapshot.price_status,'quote_only_not_checkout');
  assert.deepEqual(
    snapshot.tiers.map(x=>[x.offer_key,x.duration_seconds,x.amount_cents]),
    FORENSISCOPE_OFFERS.map(x=>[x.offer_key,x.max_duration_seconds,x.amount_usd*100])
  );
});

test('the mobile-first preview selects local media without transmitting it',()=>{
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/<meta name="robots" content="noindex,nofollow"/);
  assert.match(html,/<input id="file" type="file"/);
  assert.match(html,/Your recording stays on this device/);
  assert.match(html,/Secure upload, self-service checkout, processing, and private result delivery are not yet available/);
  assert.match(html,/You cannot be charged on this page/);
  assert.match(html,/script type="module" src="\.\/app.mjs"/);
  assert.doesNotMatch(html,/mailto:|<form|checkout\.stripe|base44/i);
  assert.match(script,/URL\.createObjectURL\(file\)/);
  assert.match(script,/URL\.revokeObjectURL\(blob\)/);
  assert.match(script,/loadedmetadata/);
  assert.match(script,/Number\.isFinite\(seconds\)/);
  assert.match(script,/Math\.ceil\(seconds\)/);
  assert.match(script,/chosen\.amount_cents/);
  assert.doesNotMatch(script,/fetch\(.*(?:POST|PUT|upload)/i);
  assert.doesNotMatch(script,/FormData|navigator\.sendBeacon|XMLHttpRequest|WebSocket|serviceWorker/i);
});
