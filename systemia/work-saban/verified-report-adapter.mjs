import { executeBoundedTasks } from './bounded-executor.mjs';
import { executeLocalSalesReport } from './execute-local.mjs';
import { sha256 } from './csv-core.mjs';

// Real local registered-worker pipeline, not independent LLM agents.
// Explicit consent is required; no external action or public delivery.
export async function executeVerifiedReportTask({csvText,localFileReadApproved=false,onEvent=()=>{}}={}){
  if(localFileReadApproved!==true)throw new Error('explicit_local_file_consent_required');
  const tasks=[{
    id:'registered-sales-report',
    run:()=>executeLocalSalesReport({csvText,localFileReadApproved:true}),
    verify:result=>result?.status==='verified_local'
      &&result.quality?.status==='verified'
      &&result.specialist_receipts?.length===5
      &&new Set(result.specialist_receipts.map(r=>r.role)).size===5
      &&['analyst','writer','designer','auditor','coordinator'].every(role=>
        result.specialist_receipts.some(r=>r.role===role&&r.status==='completed'
          &&r.quality_status==='pass'&&/^[a-f0-9]{64}$/.test(r.result_sha256||'')))
      &&result.source_sha256&&/^[a-f0-9]{64}$/.test(result.source_sha256)
      &&typeof result.report_markdown==='string'
      &&sha256(result.report_markdown)===result.report_sha256
      &&result.model_inference===false
      &&result.external_actions?.length===0
  }];
  const execution=await executeBoundedTasks(tasks,{concurrency:1,onEvent});
  const outcome=execution.results[0];
  if(!outcome?.ok)throw new Error('registered_report_not_verified:'+String(outcome?.error||'unknown'));
  return {report:outcome.value,capacity:execution.capacity};
}
