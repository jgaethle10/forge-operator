import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeSalesCsv,checkSalesReport,formatUsd,salesMarkdown,MAX_CSV_BYTES,MAX_CSV_ROWS}
  from '../public/work-saban/report/engine.mjs';
const root=new URL('../public/work-saban/',import.meta.url);
const fixture=fs.readFileSync(new URL('example-sales.csv',root),'utf8');
const page=fs.readFileSync(new URL('report/index.html',root),'utf8');
const client=fs.readFileSync(new URL('report/report.js',root),'utf8');
const marketing=fs.readFileSync(new URL('index.html',root),'utf8');
const example=fs.readFileSync(new URL('demo/index.html',root),'utf8');
const planner=fs.readFileSync(new URL('plan/index.html',root),'utf8');
const digest='sha256:'+'0'.repeat(64);

test('real sample CSV passes the same narrow user-owned browser reporting path',()=>{
  const result=analyzeSalesCsv(fixture);
  assert.equal(result.rowCount,6);
  assert.equal(result.totalCents,'3630100');
  assert.equal(result.lastChangeCents,'-79950');
  assert.deepEqual(result.months,[{month:'2026-07',cents:'1250050'},
    {month:'2026-08',cents:'1230000'},{month:'2026-09',cents:'1150050'}]);
  assert.equal(formatUsd(result.totalCents),'$36,301.00');
  assert.ok(checkSalesReport(fixture,result));
  const output=salesMarkdown(result,digest);
  for(const value of ['Monthly sales report','$36,301.00','Down $799.50',
    '| 2026-07 | $12,500.50 |','second pass','Source digest: sha256:'])
    assert.ok(output.includes(value),value);
});

test('quoted categories, extra columns, reordered headers, CRLF and exact negative returns',()=>{
  const csv='\uFEFFcategory,revenue,month,notes\r\n'+
    '"A, B",100.10,2026-07,ok\r\n'+
    'Other,20.15,2026-07,ok\r\n'+
    'Returns,-10.25,2026-08,ok\r\n'+
    'Services,300.00,2026-08,ok\r\n';
  const result=analyzeSalesCsv(csv);
  assert.deepEqual(result.months,[{month:'2026-07',cents:'12025'},
    {month:'2026-08',cents:'28975'}]);
  assert.equal(result.totalCents,'41000');
  assert.equal(result.lastChangeCents,'16950');
  assert.ok(checkSalesReport(csv,result));
  assert.equal(formatUsd('-50'),'-$0.50');
});

test('adversarial changes do not pass the independent arithmetic check',()=>{
  const result=analyzeSalesCsv(fixture);
  for(const altered of [
    {...result,rowCount:7},
    {...result,totalCents:'3630101'},
    {...result,lastChangeCents:'0'},
    {...result,months:result.months.slice(0,2)},
    {...result,months:[...result.months.slice(0,2),{month:'2026-09',cents:'1'}]}
  ])assert.equal(checkSalesReport(fixture,altered),false);
  assert.equal(checkSalesReport(fixture.replace('10500.00','10500.01'),result),false);
  assert.throws(()=>salesMarkdown(result,'not-a-hash'));
});

test('bad rows fail closed, do not guess month, currency, or missing values',()=>{
  const invalid=[
    'date,revenue\n2026-07,100\n2026-08,200',
    'month,revenue\n2026-07,100\n2026-07,200',
    'month,revenue\n2026-13,100\n2026-08,200',
    'month,revenue\n2026-07,123.456\n2026-08,200',
    'month,revenue\n2026-07,$100\n2026-08,200',
    'month,revenue\n2026-07,1e3\n2026-08,200',
    'month,revenue\n2026-07,100\n2026-08,',
    'month,revenue\n2026-07,"100"oops\n2026-08,200',
    'month,revenue\n2026-07,"100\n2026-08,200',
    'month,revenue,Revenue\n2026-07,100,10\n2026-08,200,20',
    'month,revenue\n2026-07,100,3\n2026-08,200',
    'month,revenue\n2026-07,100',
    'a'.repeat(MAX_CSV_BYTES+1),
    'month,revenue\n'+Array.from({length:MAX_CSV_ROWS+1},(_,i)=>
       (i%2?'2026-07,100':'2026-08,200')).join('\n')
  ];
  for(const input of invalid)assert.throws(()=>analyzeSalesCsv(input),input.slice(0,55));
});

test('customer page is consent gated, first-party, no external transfers, truthful about stage',()=>{
  assert.match(page,/id="csv-file" accept="\.csv,text\/csv"/);
  assert.match(page,/id="consent"/);
  assert.match(page,/id="run" disabled/);
  assert.match(page,/connect-src 'none'/);
  assert.match(page,/form-action 'none'/);
  assert.match(page,/No signup, upload, payment or AI model/);
  assert.match(page,/No hosted AI agent execution/);
  assert.match(client,/AI agents or external auditors: NOT USED/);
  assert.match(page,/id="copy"/);
  assert.match(page,/id="fallback" hidden/);
  assert.match(page,/prefers-reduced-motion:reduce/);
  assert.match(client,/file\.text\(\)/);
  assert.match(client,/consent\.checked/);
  assert.match(client,/file\.size>MAX_CSV_BYTES/);
  assert.match(client,/checkSalesReport\(text,result\)/);
  assert.match(client,/crypto\.subtle\.digest/);
  assert.match(client,/download='work-saban-monthly-sales-report\.md'/);
  assert.match(client,/navigator\.clipboard\.writeText\(reportText\)/);
  assert.match(client,/textContent=/);
  assert.match(client,/fileField\.value=''/);
  assert.doesNotMatch(client,/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(page,/<form\b|buy\.stripe\.com|<iframe\b/i);
  assert.match(marketing,/href="\.\/report\/"/);
  assert.match(example,/href="\.\.\/report\/"/);
  assert.match(planner,/href="\.\.\/report\/"/);
});
