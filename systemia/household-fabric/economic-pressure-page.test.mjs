import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RESOURCES, matchResources, costDelta } from '../../public/economic-pressure/pressure-ui.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolve(root,'public/economic-pressure/index.html'), 'utf8');

test('public static pilot contains dated national, state and county evidence with their own sources',()=>{
  for(const phrase of ['3.7%','+9.1%','4.8%','5.5%','October 21, 2026','Aug 2026','Sep 2026','County September data']) {
    assert.ok(html.includes(phrase),'missing '+phrase);
  }
  for(const domain of ['www.bls.gov','esd.wa.gov','www.dshs.wa.gov','www.commerce.wa.gov','search.wa211.org'])assert.ok(html.includes(domain),domain);
  assert.match(html,/name="robots" content="noindex,nofollow"/i,'draft must not be indexed before publication gate');
  assert.match(html,/type="module" src="\.\/pressure-ui.mjs"/);
});

test('same-volume cost arithmetic rejects absent, invalid and enormous inputs',()=>{
  assert.equal(costDelta(100,3.50,4),50);
  assert.equal(costDelta(100,4,3.50),-50);
  assert.equal(costDelta(0,3,4),0);
  for(const args of [['','2','3'],['2','','3'],['2','3','-1'],['Infinity','2','3'],['NaN','2','3'],[1e13,1,2]])assert.equal(costDelta(...args),null);
});

test('resource selection respects role and pressure; no invented value or eligibility flags',()=>{
  assert.ok(matchResources('business','business').some(x=>x.id==='sharedwork'));
  assert.ok(matchResources('farmer','business').some(x=>x.id==='fsa'));
  assert.ok(matchResources('household','food').some(x=>x.id==='basic-food'));
  assert.ok(matchResources('household','utilities').some(x=>x.id==='liheap'));
  for(const r of RESOURCES){
    assert.ok(r.href.startsWith('https://'));
    assert.ok(!('verified_savings_cents' in r));
    assert.ok(!('eligible' in r));
    assert.ok(r.description.length>40);
  }
});

test('sensitive household impact caveats are visible but no trackers, network writes or credentials',()=>{
  assert.match(html,/not a live feed/i);
  assert.match(html,/No names, income details, logins or financial accounts required/);
  assert.match(html,/SNAP\/LIHEAP 2026 notice/);
  assert.ok(RESOURCES.find(x=>x.id==='basic-food').description.includes('2026 SNAP/LIHEAP'));
  const js=readFileSync(resolve(root,'public/economic-pressure/pressure-ui.mjs'),'utf8');
  assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(html,/googletagmanager|gtag\(|pixel|<form/i);
});
