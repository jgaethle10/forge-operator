import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createWorkState } from '../saban/work-state.mjs';
import { runScheduler } from '../saban/scheduler.mjs';
import { runRegisteredAssignment } from '../saban/registered-worker.mjs';
import { loadMultiplicationRegistry, resolveMultiplicationContract } from '../saban/multiplier.mjs';
import { admitMultiplicationRequest } from '../saban/admission.mjs';
import { evaluateSwarmQuality } from '../saban/quality-gate.mjs';
import { topologicalWaves } from '../saban/formation.mjs';
import { parseSalesCsv, sha256 } from './csv-core.mjs';

const SOFTWARE = 'work-saban-csv-report-v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = ['analyst', 'writer', 'designer', 'auditor', 'coordinator'];

export async function executeLocalSalesReport({
  csvText, localFileReadApproved = false, rootDir = ROOT,
  afterStage = null
} = {}) {
  if (localFileReadApproved !== true) throw new Error('explicit_local_file_consent_required');
  const parsed = parseSalesCsv(csvText);
  const registry = loadMultiplicationRegistry(path.join(rootDir, 'systemia/saban/multiplication-registry.json'));
  const contract = resolveMultiplicationContract(SOFTWARE, registry);
  const admission = admitMultiplicationRequest({
    contract, requestedLogicalAgents: 1, requestedPhysicalWorkers: 1,
    requestedWorkItems: 1, requestedAttempts: 2, budget: contract.budget
  });
  if (!admission.admitted) throw new Error('systemia_saban_contract_admission_denied');
  const runId = randomUUID();
  const nodes = STAGES.map((role, index) => ({
    id: role,
    depends_on: index ? [STAGES[index - 1]] : []
  }));
  const waves = topologicalWaves(nodes);
  const outputs = {};
  const receipts = [];
  for (const wave of waves) {
    for (const role of wave) {
      const assignment = {
        agent_id: 'work-saban-' + role,
        idempotency_key: sha256(SOFTWARE + ':' + runId + ':' + role + ':' + parsed.source_sha256),
        role,
        work: { kind: 'monthly_sales_csv', key: parsed.source_sha256, source_file: null },
        item: { kind: 'monthly_sales_csv', key: parsed.source_sha256, raw: null },
      };
      const state = createWorkState({
        softwareId: SOFTWARE, assignments: [assignment],
        leaseSeconds: admission.grant.lease_seconds,
        maxAttempts: admission.grant.max_attempts_per_job,
      });
      const receipt = await runScheduler({
        state,
        physicalWorkers: admission.grant.physical_workers,
        plan: { software_id: SOFTWARE, logical_agents: 1, physical_workers: 1, roles: [role] },
        contract,
        rootDir,
        adapter: {
          runAssignment: async ({ assignment: current }) => runRegisteredAssignment({
            software: SOFTWARE,
            assignment: current,
            rootDir,
            executionContext: {
              local_file_read_approved: true,
              csvText,
              stages: structuredClone(outputs),
            }
          })
        }
      });
      const job = Object.values(receipt.state.jobs)[0];
      if (receipt.summary.counts.completed !== 1 || job?.state !== 'completed' || job?.result?.role !== role) {
        throw new Error('work_saban_stage_failed_' + role);
      }
      const quality = evaluateSwarmQuality({
        contract,
        plan: { logical_agents: 1, roles: [role] },
        results: [{ role, status: 'completed' }],
        schedulerSummary: receipt.summary,
      });
      if (quality.status !== 'pass') throw new Error('work_saban_quality_failed_' + role);
      const result = job.result.result;
      if (!result || result.role !== role) throw new Error('work_saban_stage_receipt_mismatch_' + role);
      outputs[role] = result;
      const row = {
        role, status: 'completed',
        idempotency_key: assignment.idempotency_key,
        result_sha256: sha256(JSON.stringify(result)),
        worker_receipt_schema: job.result.schema,
        quality_status: quality.status,
        attempts: job.attempts,
        measured_duration_ms: job.metrics?.duration_ms ?? null,
      };
      receipts.push(row);
      if (typeof afterStage === 'function') await afterStage(row);
    }
  }
  const final = outputs.coordinator;
  if (final?.verified !== true || final.report_sha256 !== sha256(final.markdown)
      || outputs.auditor.status !== 'verified') throw new Error('work_saban_audited_delivery_required');
  return {
    schema: 'evercraft.work-saban.local-csv-execution-receipt.v1',
    run_id: runId,
    status: 'verified_local',
    evidence_state: 'actual_registered_worker_local',
    model_inference: false,
    physically_distributed: false,
    public_execution: false,
    human_account_access: false,
    source_sha256: parsed.source_sha256,
    report_sha256: final.report_sha256,
    report_markdown: final.markdown,
    revenue_analysis: outputs.analyst,
    execution_waves: waves,
    specialist_receipts: receipts,
    quality: outputs.auditor,
    commercial_payment_verified: false,
    external_actions: [],
  };
}

export function writeLocalSalesReport(result, outputDir) {
  if (result?.status !== 'verified_local' || !result.quality
      || result.quality.status !== 'verified'
      || sha256(result.report_markdown) !== result.report_sha256) {
    throw new Error('output_must_be_audited_before_delivery');
  }
  if (typeof outputDir !== 'string' || !outputDir.trim()) throw new Error('output_dir_required');
  const base = path.resolve(outputDir);
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const filename = 'work-saban-' + result.run_id;
  const reportPath = path.join(base, filename + '.md');
  const receiptPath = path.join(base, filename + '.receipt.json');
  fs.writeFileSync(reportPath, result.report_markdown, { flag: 'wx', mode: 0o600 });
  try {
    const { report_markdown, ...safeReceipt } = result;
    fs.writeFileSync(receiptPath, JSON.stringify(safeReceipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    fs.unlinkSync(reportPath);
    throw error;
  }
  return { reportPath, receiptPath, report_sha256: result.report_sha256 };
}

async function main(argv) {
  const demo = argv.includes('--demo');
  const csvIndex = argv.indexOf('--csv');
  const outIndex = argv.indexOf('--out');
  const file = csvIndex < 0 ? null : argv[csvIndex + 1];
  const outputDir = outIndex < 0 ? null : argv[outIndex + 1];
  if (!outputDir) throw new Error('usage: node systemia/work-saban/execute-local.mjs --demo|--csv FILE --approve-local-read --out OUTPUT_DIR');
  if (demo === Boolean(file)) throw new Error('provide_exactly_one_of_demo_or_csv_file');
  if (file && !argv.includes('--approve-local-read')) throw new Error('explicit_local_file_consent_required');
  const source = demo ? path.join(ROOT, 'systemia/work-saban/fixtures/monthly-sales-demo.csv') : path.resolve(file);
  if (!fs.statSync(source).isFile()) throw new Error('source_must_be_file');
  const csvText = fs.readFileSync(source, 'utf8');
  const result = await executeLocalSalesReport({ csvText, localFileReadApproved: true });
  const delivered = writeLocalSalesReport(result, outputDir);
  process.stdout.write(JSON.stringify({
    status: result.status,
    mode: result.evidence_state,
    specialist_count: result.specialist_receipts.length,
    report_sha256: delivered.report_sha256,
    report_file: delivered.reportPath,
    receipt_file: delivered.receiptPath,
  }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Work Saban local execution held:', error.message);
    process.exitCode = 1;
  });
}
