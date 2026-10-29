import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../public/work-saban/',import.meta.url);
const main=fs.readFileSync(new URL('index.html',root),'utf8');
const brand=fs.readFileSync(new URL('brand/index.html',root),'utf8');
const mark=fs.readFileSync(new URL('brand/work-saban-mark.svg',root),'utf8');
const art=fs.readFileSync(new URL('brand/work-saban-social.svg',root),'utf8');
const kit=fs.readFileSync(new URL('../docs/commercial/work-saban-launch-system-20261028.md',import.meta.url),'utf8');

test('simple homepage gets from task to example to pilot with no maze',()=>{
  for(const p of ['Give your work','One task. Three simple steps.','THE FIRST USE CASE',
    'PRIVATE PILOT INTEREST','id="faq"','Request the private pilot by email']) assert.ok(main.includes(p),'missing '+p);
  assert.match(main,/<html lang="en">/);
  assert.match(main,/<main id="top">/);
  assert.ok(main.indexOf('id="how"')<main.indexOf('id="pilot"'));
  assert.ok(main.indexOf('id="pilot"')<main.indexOf('id="faq"'));
  assert.ok(main.length<18000,'do not bury customers under internal complexity');
  assert.doesNotMatch(main,/Systemia mission|multiplication registry|lease scheduler/i);
});

test('the tour is a labeled example, not a fake customer operation',()=>{
  for(const p of ['Illustrative preview','not live customer execution',
    'synthetic example data','isn\'t a public self-service product yet',
    'No public CSV uploads','No self-service payment or fulfillment promise',
    'No payment at inquiry','No calls required']) assert.ok(main.includes(p),'missing '+p);
  assert.doesNotMatch(main,/<form\b|<input\b|<script\b|buy\.stripe\.com/i);
});
test('monthly report math comes only from synthetic fixture',()=>{
  const fixture=fs.readFileSync(new URL('../systemia/work-saban/fixtures/monthly-sales-demo.csv',import.meta.url),'utf8');
  const groups={};
  for(const line of fixture.trim().split(/\r?\n/).slice(1)){
    const [month,price]=line.split(',');
    const [whole,fraction='00']=price.split('.');
    groups[month]=(groups[month]||0)+(Number(whole)*100+Number(fraction));
  }
  assert.deepEqual(groups,{'2026-07':1250050,'2026-08':1230000,'2026-09':1150050});
  assert.equal(Object.values(groups).reduce((a,b)=>a+b,0),3630100);
  for(const v of ['$36,301.00','$12,500.50','$12,300.00','$11,500.50','$799.50']) assert.ok(main.includes(v),v);
});

test('first party visual identity matches white/crimson/black and has owned vectors',()=>{
  assert.match(mark,/<svg\b/);
  assert.match(art,/viewBox="0 0 1200 630"/);
  for(const token of ['#FFFFFF','#A4142F','#171717']) assert.ok(mark.includes(token)||art.includes(token),token);
  assert.ok(brand.includes('Mostly white.'));
  assert.ok(brand.includes('Confident crimson.'));
  assert.ok(brand.includes('#F8F8F7'));
  assert.match(brand,/work-saban-mark\.svg/);
  assert.match(brand,/work-saban-social\.svg/);
  assert.match(main,/href="\.\/brand\/"/);
  assert.ok(kit.includes('30-second commercial'));
  assert.ok(kit.includes('provider-verified'));
});
