import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateExample,auditExample,formatReportMarkdown,formatCents} from '../public/work-saban/demo/engine.mjs';

const csv=fs.readFileSync(new URL('../public/work-saban/example-sales.csv',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/work-saban/demo/index.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/work-saban/demo/demo.js',import.meta.url),'utf8');
const landing=fs.readFileSync(new URL('../public/work-saban/index.html',import.meta.url),'utf8');

test('the public synthetic fixture actually computes the example report',()=>{
  const r=calculateExample(csv);
  assert.equal(r.rowCount,6);
  assert.deepEqual(r.months,[{month:'2026-07',cents:1250050},{month:'2026-08',cents:1230000},{month:'2026-09',cents:1150050}]);
  assert.equal(r.grandTotal,3630100);
  assert.equal(r.lastChange,-79950);
  assert.equal(formatCents(r.grandTotal),'$36,301.00');
  assert.equal(formatCents(-r.lastChange),'$799.50');
  assert.ok(auditExample(csv,r));
  const markdown=formatReportMarkdown(r);
  for(const token of ['Synthetic example only.','Total revenue: $36,301.00','2026-09 | $11,500.50','Down $799.50','second-pass exact-cent arithmetic']) assert.ok(markdown.includes(token),token);
});
test('second-pass audit rejects altered totals, omitted rows and forged movement',()=>{
  const r=calculateExample(csv);
  assert.equal(auditExample(csv,{...r,grandTotal:r.grandTotal+100}),false);
  assert.equal(auditExample(csv,{...r,rowCount:r.rowCount+1}),false);
  assert.equal(auditExample(csv,{...r,lastChange:0}),false);
  assert.equal(auditExample(csv,{...r,months:[...r.months.slice(0,2),{month:'2026-09',cents:1}]}),false);
  assert.equal(auditExample(csv.replace('10500.00','10500.01'),r),false);
});
test('invalid CSV and unsupported data cannot create a result',()=>{
  for(const invalid of ['month,revenue,category\n2026-01,not-money,X',
   'month,revenue,category\n2026-13,15.00,X',
   'month,revenue,category\n2026-01,15.00',
   'month,revenue,category\n2026-01,15.00,',
   'month,revenue,category\n2026-01,-12.00,X',
   'month,revenue,category\n2026-01,12.125,X',
   'month,revenue,category\n2026-01,99999999999.00,X'])
    assert.throws(()=>calculateExample(invalid));
});
test('a real one-click public example is linked without customer upload or checkout',()=>{
  assert.match(landing,/href="\.\/demo\/"[^>]*>Try a real browser example/);
  assert.match(html,/id="run"/);
  assert.match(html,/id="output" hidden/);
  assert.match(html,/No account, uploads, or payments/);
  assert.match(html,/not a video or a pretend AI team/);
  assert.match(html,/It does not run the five-worker local Work Saban software/);
  assert.match(html,/id="download"/);
  assert.match(html,/color-scheme:light/);
  assert.match(html,/#a4142f/);
  assert.match(client,/fetch\('\.\.\/example-sales\.csv'/);
  assert.match(client,/credentials:'omit'/);
  assert.match(client,/auditExample\(csv,result\)/);
  assert.match(client,/crypto\.subtle\.digest/);
  assert.doesNotMatch(html,/<input\b|<form\b|buy\.stripe\.com|<iframe\b/i);
  assert.doesNotMatch(client,/\bPOST\b|sendBeacon|localStorage|sessionStorage|fetch\('https?:/i);
});

test('mobile screen recording follow-up keeps the example in view and makes save outcomes clear',()=>{
  for(const id of ['id="save-status"','id="copy"','id="report-text"','id="copy-fallback"'])
    assert.ok(html.includes(id),'missing accessible save feedback '+id);
  assert.match(client, /\$\('output'\)\.scrollIntoView/);
  assert.match(client,/prefers-reduced-motion: reduce/);
  assert.match(client,/Download requested\. If nothing happens on your phone, tap Copy report/);
  assert.match(client,/navigator\.clipboard\.writeText\(report\)/);
  assert.match(client,/\$\('report-text'\)\.select\(\)/);
  assert.match(client,/Report copied\. Paste it wherever you like/);
  assert.match(html,/role="status" aria-live="polite"/);
  assert.match(html,/If copying is blocked by your browser/);
  assert.doesNotMatch(client,/Report saved successfully/);
});
