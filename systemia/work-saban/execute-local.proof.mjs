import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeLocalSalesReport, writeLocalSalesReport } from './execute-local.mjs';
import { parseSalesCsv, calculateRevenue, sha256 } from './csv-core.mjs';
import { runAssignment } from './csv-worker.mjs';
import { loadMultiplicationRegistry, resolveMultiplicationContract } from '../saban/multiplier.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const csvText = fs.readFileSync(path.join(here, 'fixtures/monthly-sales-demo.csv'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-saban-execution-proof-'));
try {
  await assert.rejects(executeLocalSalesReport({csvText}), /explicit_local_file_consent_required/);
  const events = [];
  const result = await executeLocalSalesReport({
    csvText, localFileReadApproved:true, afterStage:row => events.push(row.role),
  });
  assert.equal(result.schema, 'evercraft.work-saban.local-csv-execution-receipt.v1');
  assert.equal(result.status, 'verified_local');
  assert.equal(result.model_inference, false);
  assert.equal(result.physically_distributed, false);
  assert.equal(result.public_execution, false);
  assert.equal(result.commercial_payment_verified, false);
  assert.deepEqual(result.external_actions, []);
  assert.deepEqual(events, ['analyst','writer','designer','auditor','coordinator']);
  assert.equal(result.specialist_receipts.length, 5);
  assert(result.specialist_receipts.every(row => row.status === 'completed' && row.quality_status === 'pass'));
  assert.equal(result.revenue_analysis.row_count, 6);
  assert.deepEqual(result.revenue_analysis.monthly.map(row=>row.cents), ['1250050','1230000','1150050']);
  assert.equal(result.revenue_analysis.change_cents, '-79950');
  assert.equal(result.revenue_analysis.percent_change, -6.5);
  assert.equal(result.quality.status, 'verified');
  assert.equal(sha256(result.report_markdown), result.report_sha256);
  assert(result.report_markdown.includes('No evidence about the cause'));

  const delivered = writeLocalSalesReport(result, dir);
  assert.equal(fs.readFileSync(delivered.reportPath, 'utf8'), result.report_markdown);
  const receipt = JSON.parse(fs.readFileSync(delivered.receiptPath, 'utf8'));
  assert.equal(receipt.report_sha256, sha256(fs.readFileSync(delivered.reportPath, 'utf8')));
  assert(!Object.hasOwn(receipt,'report_markdown'));
  assert.equal(receipt.specialist_receipts.length, 5);
  assert.throws(()=>writeLocalSalesReport({...result,report_sha256:'sha256:bad'}, dir), /audited/);

  const contract = resolveMultiplicationContract('work-saban-csv-report-v1',
    loadMultiplicationRegistry(path.resolve(here,'../../systemia/saban/multiplication-registry.json')));
  assert.equal(contract.side_effects.default, 'deny');
  assert.equal(contract.side_effects.external_network, false);
  assert.equal(contract.side_effects.payment_obligation, false);
  const fakeAssignment = {role:'auditor',work:{kind:'monthly_sales_csv'}};
  await assert.rejects(runAssignment({assignment:fakeAssignment,contract,
    executionContext:{local_file_read_approved:true,csvText,stages:{
      analyst:{...result.revenue_analysis,monthly:[{month:'2026-07',cents:'999999',display:'$9,999.99'}]},
      writer:{role:'writer',source_sha256:result.source_sha256,summary:'not verified'},
      designer:{role:'designer',source_sha256:result.source_sha256,content_sha256:'sha256:wrong',markdown:'wrong'},
    }}}), /audit_/);
  assert.throws(()=>parseSalesCsv('month,revenue\n2026-01,1.00\n2026-02,1.005'), /invalid_revenue/);
  assert.throws(()=>parseSalesCsv('month,revenue\n2026-01,1.00\n2026-02,"2.00'), /unclosed_quote/);
  assert.throws(()=>calculateRevenue(parseSalesCsv('month,revenue\n2026-01,1.00\n2026-01,2.00').rows), /distinct_months/);
} finally {
  fs.rmSync(dir, {recursive:true,force:true});
}
console.log('Work Saban governed local CSV worker execution: PASS (5 registered stages, independent arithmetic audit, local artifacts).');
