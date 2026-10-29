import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/work-saban/index.html', import.meta.url), 'utf8');
const required = [
  'Work Saban',
  'You bring the work.',
  'Saban brings the team.',
  'PRIVATE PILOT INTEREST',
  'monthly sales CSV',
  'PRIVATE PILOT',
  'mailto:jessegaethle10@gmail.com?subject=Work%20Saban%20private%20reporting%20pilot',
  'No payment at inquiry',
  'No public CSV uploads',
  'No self-service payment or fulfillment promise',
  'No calls required',
];

test('Work Saban pilot door gives a qualified buyer a no-call inquiry path', () => {
  for (const phrase of required) assert.ok(html.toLowerCase().includes(phrase.toLowerCase()), 'missing: ' + phrase);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/jgaethle10\.github\.io\/forge-operator\/work-saban\/">/);
});

test('Work Saban buyer page does not misrepresent the local preview as publicly sold', () => {
  assert.match(html, /Not a public self-service product yet/);
  assert.match(html, /No multi-tenant accounts or live general-purpose AI specialists/);
  assert.match(html, /Please send no confidential files/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<input\b/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<a\b[^>]*href="https:\/\/buy\.stripe\.com/i);
});

test('separates customer intent from verified payment and delivery', () => {
  assert.match(html, /An inquiry is not an order, charge, acceptance, or guarantee of availability/);
  assert.match(html, /No external account action or payment is initiated from this page/);
});