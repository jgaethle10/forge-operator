#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLocalEventChain, sha256Text } from './trace-chain.mjs';

const roles=['analyst','writer','designer','auditor','coordinator'];

export function auditWorkSabanTrace(archive) {
  if (archive?.schema!=='evercraft.work-saban.local-trace-export.v1'
      ||archive?.authenticity!=='local_hash_chain_unsigned'
      ||archive?.status!=='completed') throw new Error('invalid_work_saban_trace_archive');
  const events=archive.events;
  const chain=verifyLocalEventChain(events);
  if(chain.count!==12||archive.event_count!==chain.count
      ||archive.trace_id!==chain.trace_id||archive.tail_digest!==chain.tail_digest)
    throw new Error('trace_header_mismatch');
  if(events[0]?.type!=='accepted'||events.at(-1)?.type!=='completed')
    throw new Error('invalid_event_boundaries');
  for(let i=0;i<5;i++) {
    if(events[i*2+1]?.type!=='stage_started'
       ||events[i*2+1]?.role!==roles[i]
       ||events[i*2+2]?.type!=='stage_verified'
       ||events[i*2+2]?.role!==roles[i]) throw new Error('invalid_worker_sequence');
  }
  const last=events.at(-1).execution;
  if(last?.status!=='verified_local'||last?.quality?.status!=='verified'
     ||last?.evidence_state!=='actual_registered_worker_local'
     ||last?.physically_distributed!==false||last?.public_execution!==false
     ||last?.human_account_access!==false
     ||last?.model_inference!==false||!Array.isArray(last?.external_actions)
     ||last.external_actions.length!==0||last?.specialist_receipts?.length!==5
     ||!/^sha256:[0-9a-f]{64}$/.test(last?.source_sha256||''))
    throw new Error('unverified_final_delivery');
  for(let i=0;i<5;i++) {
    const worker=events[i*2+2]?.receipt;
    const final=last.specialist_receipts[i];
    if(worker?.role!==roles[i]||worker.status!=='completed'||worker.quality_status!=='pass'
       ||!/^sha256:[0-9a-f]{64}$/.test(worker.result_sha256||'')
       ||!Number.isInteger(worker.attempts)||worker.attempts<1||worker.attempts>2
       ||!/^sha256:[0-9a-f]{64}$/.test(worker.idempotency_key||'')
       ||final?.role!==roles[i]||final.result_sha256!==worker.result_sha256
       ||final.idempotency_key!==worker.idempotency_key
       ||final.attempts!==worker.attempts||final.status!==worker.status
       ||final.quality_status!==worker.quality_status)
      throw new Error('worker_receipt_mismatch');
  }
  if(typeof last.report_markdown!=='string'
     ||sha256Text(last.report_markdown)!==last.report_sha256)
    throw new Error('report_digest_mismatch');
  return {
    status:'local_trace_integrity_verified',
    trace_id:chain.trace_id,
    event_count:chain.count,
    tail_digest:chain.tail_digest,
    report_sha256:last.report_sha256,
    worker_roles:roles,
    authenticity:'local_hash_chain_unsigned',
    independent_identity_attestation:false,
    model_inference:false
  };
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const source=process.argv[2];
    if(!source)throw new Error('usage: node systemia/work-saban/audit-trace.mjs PATH_TO_EXPORTED_JSON');
    const stat=fs.statSync(source);
    if(!stat.isFile()||stat.size>1024*1024)throw new Error('trace_file_size_invalid');
    const result=auditWorkSabanTrace(JSON.parse(fs.readFileSync(source,'utf8')));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(error) {
    console.error('Work Saban trace verification refused:',error.message);
    process.exitCode=1;
  }
}
