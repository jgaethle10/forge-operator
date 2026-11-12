import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report=fs.readFileSync('public/work-saban/report/index.html','utf8');
const hub=fs.readFileSync('public/try/index.html','utf8');
const start=report.indexOf('<section id="result"');

test('a completed free CSV report offers one clear written commercial pilot path',()=>{
 assert.ok(start>=0);
 const first=report.indexOf('id="report-pilot-inquiry"');
 assert.ok(first>start,'pilot action should be available after the report');
 assert.match(report,/Need this kind of report every month\?/);
 assert.match(report,/Ask about a reporting pilot/);
 assert.match(report,/scope and pricing agreed in writing before any work/);
 assert.match(report,/No calls required/);
 assert.match(report,/No payment or service is started/);
 assert.match(report,/Work Saban never attaches or sends your CSV, report, figures, or proof hashes/);
});

test('one-click mailto is explicitly user-initiated and carries no private report data',()=>{
 const m=report.match(/<a class="pilot-cta" id="report-pilot-inquiry" href="([^"]+)"/);
 assert.ok(m,'missing exact CTA');
 const target=new URL(m[1].replaceAll('&amp;','&'));
 assert.equal(target.protocol,'mailto:');
 assert.equal(target.pathname,'jessegaethle10@gmail.com');
 const subject=target.searchParams.get('subject');
 const body=target.searchParams.get('body');
 assert.match(subject,/Work Saban private reporting pilot inquiry/);
 for(const phrase of ['My role or business type:','What I want the report to answer:','How often I need the report:','Please reply in writing.','Source: work-saban-report-result']) assert.ok(body.includes(phrase),phrase);
 assert.doesNotMatch(body,/\$36,301|sourceDigest|reportDigest|sha256:|CSV=|attachment=/);
 assert.doesNotMatch(m[1],/javascript:|https?:\/\//i);
 assert.match(report,/connect-src 'none'/);
 assert.match(report,/form-action 'none'/);
 assert.match(report,/Opens your email app only if you choose/);
});

test('owned free hub permits both free self-serve and opted-in custom reporting interest',()=>{
 assert.match(hub,/Make a free sales report/);
 assert.match(hub,/work-saban\/report\/\?utm_source=evercraft_try/);
 assert.match(hub,/Need a customized report\? Ask about a private pilot/);
 assert.match(hub,/work-saban\/\?utm_source=evercraft_try&amp;utm_medium=free_hub&amp;utm_campaign=work_saban&amp;utm_content=custom_reporting_pilot#pilot/);
 assert.match(hub,/Sample data only/);
});
