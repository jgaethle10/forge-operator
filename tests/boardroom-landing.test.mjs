import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../public/mesh/ai-boardroom/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const discovery=JSON.parse(readFileSync(new URL('ai-discovery.json',root),'utf8'));
const checkout=JSON.parse(readFileSync(new URL('../checkout-ready/verified-links.json',root),'utf8'));

test('launch page is a genuine customer-facing entry',()=>{
 assert.match(html,/<html lang="en">/);
 assert.match(html,/What's on your mind\?/);
 assert.match(html,/Build my decision brief/);
 assert.match(html,/id="brief" hidden/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/@media\(max-width:600px\)/);
 assert.match(html,/<meta name="description"/);
});
test('free decision brief is explicitly local and cannot pretend to run AI',()=>{
 assert.match(html,/created in your browser/);
 assert.match(html,/not an AI-generated verdict/);
 assert.match(html,/not a verified public feature/);
 assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|WebSocket\s*\(/);
 assert.doesNotMatch(html,/<script[^>]*src=/);
 assert.match(html,/question\.textContent=value/);
});
test('free product and existing exact paid service routes are preserved',()=>{
 assert.match(html,/href="\.\/compare\/"/);
 assert.match(html,/href="\.\.\/checkout-ready\/ai-boardroom-standard\/"/);
 assert.match(html,/href="\.\.\/checkout-ready\/ai-boardroom-financial-modeling\/"/);
 const offeredKeys=new Map(checkout.links.map(l=>[l.key,l]));
 assert.equal(offeredKeys.get('ai-boardroom-standard').amount_cents,25000);
 assert.equal(offeredKeys.get('ai-boardroom-financial').amount_cents,50000);
 assert.match(offeredKeys.get('ai-boardroom-standard').url,/^https:\/\/buy\.stripe\.com\//);
 assert.match(offeredKeys.get('ai-boardroom-financial').url,/^https:\/\/buy\.stripe\.com\//);
 assert.equal(discovery.variants.length,2);
});
test('does not promise automated payment reconciliation or review',()=>{
 assert.match(html,/reconciliation are not represented as automated/);
 assert.match(html,/require scope, capacity, and delivery terms/);
 assert.match(html,/not a verified public feature/);
});
