import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {executeVerifiedReportTask} from './verified-report-adapter.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const csvText=fs.readFileSync(path.join(dir,'fixtures/monthly-sales-demo.csv'),'utf8');
await assert.rejects(executeVerifiedReportTask({csvText}),/explicit_local_file_consent_required/);
const events=[];
const result=await executeVerifiedReportTask({csvText,localFileReadApproved:true,onEvent:event=>events.push(event)});
assert.equal(result.report.status,'verified_local');
assert.equal(result.report.model_inference,false);
assert.equal(result.report.specialist_receipts.length,5);
assert.equal(result.capacity.verified,1);
assert.equal(result.capacity.failed,0);
assert.equal(events.filter(e=>e.state==='verified').length,1);
assert.equal(events.filter(e=>e.state==='running').length,1);
console.log('Work Saban verified report adapter PASS: consent, registered workers, five receipts, bounded verification.');
