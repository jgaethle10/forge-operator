import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../public/work-saban/', import.meta.url);
const main = fs.readFileSync(new URL('index.html', root), 'utf8');
const brand = fs.readFileSync(new URL('brand/index.html', root), 'utf8');
const mark = fs.readFileSync(new URL('brand/work-saban-mark.svg', root), 'utf8');
const art = fs.readFileSync(new URL('brand/work-saban-social.svg', root), 'utf8');
const kit = fs.readFileSync(new URL('../docs/commercial/work-saban-launch-system-20261028.md', import.meta.url), 'utf8');
test('product launch has a real accessible narrative and exact pilot path', () => {
  for(const part of ['Give the work','a team.','You bring the work. Saban brings the team.',
    'THE PRODUCT EXPERIENCE','THE FIRST REAL JOB','RELEASE REALITY','FOUNDING PARTNER PROGRAM','id="faq"',
    'Saban brings the team.','PRIVATE PILOT INTEREST','Request the private pilot by email']){
    assert.ok(main.includes(part), 'missing launch message '+part);
  }
  assert.match(main, /<html lang="en">/);
  assert.match(main, /<meta name="viewport"/);
  assert.match(main, /<main id="top">/);
  assert.match(main, /<nav[^>]+aria-label="Main navigation"/);
  assert.match(main, /@media\(max-width:620px\)/);
  assert.match(main, /@media\(prefers-reduced-motion:reduce\)/);
});
test('public tour is accurately labeled and does not fake production deployment', () => {
  for(const part of [
    'design preview using synthetic sample data',
    'not a running customer job',
    'VISUAL TOUR, NOT LIVE TELEMETRY',
    'or a remotely hosted AI workforce',
    'No multi-tenant accounts or live general-purpose AI specialists',
    'No public CSV uploads',
    'No self-service payment or fulfillment promise',
    'Please send no confidential files',
    'An inquiry is not an order, charge, acceptance, or guarantee of availability',
  ]) assert.ok(main.includes(part), 'truth boundary missing '+part);
  assert.doesNotMatch(main, /<input\b|<form\b|<script\b|buy\.stripe\.com/i);
});
test('illustrative report sums are consistent with public demo fixture', () => {
  const values = [10500.00,2000.50,11000.00,1300.00,9700.25,1800.25].map(v=>Math.round(v*100));
  assert.equal(values.reduce((a,b)=>a+b,0),3630100);
  assert.ok(main.includes('$36,301.00'));
  assert.ok(main.includes('$12,500.50'));
  assert.ok(main.includes('$12,300.00'));
  assert.ok(main.includes('$11,500.50'));
  assert.ok(main.includes('−$799.50'));
});
test('brand kit is source-ownable and stays consistent with product', () => {
  assert.match(mark, /<svg\b/);
  assert.match(art, /viewBox="0 0 1200 630"/);
  for (const token of ['#08111D','#A1EECE','#7199F8','#EDF6F7']) assert.ok(brand.includes(token), token);
  assert.match(brand, /work-saban-mark\.svg/);
  assert.match(brand, /work-saban-social\.svg/);
  assert.match(main, /href="\.\/brand\/"/);
  assert.ok(kit.includes('30-second commercial'));
  assert.ok(kit.includes('provider-verified'));
});
