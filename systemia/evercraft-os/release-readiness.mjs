#!/usr/bin/env node
/**
 * Truthful Evercraft OS release gate. A local green CI or Saban receipt is
 * never a field-device, production permission or customer-delivery receipt.
 * This script does not acquire resources, enroll devices, pay, or deploy.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditWorkflowFiles } from '../../scripts/audit-workflow-writers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RECEIPT = 'artifacts/saban-multiplier/os-readiness/latest.json';
const OUTPUT = 'artifacts/evercraft-os/release-readiness.json';
const digest = value=>'sha256:'+createHash('sha256').update(value).digest('hex');

export function assessOsRelease({sourceReceipt=null,writerAudit=null}={}) {
  const blockers=[];
  const add=(code,detail)=>blockers.push({code,detail});
  const source = sourceReceipt?.schema === 'evercraft.os.parallel-readiness-receipt.v1' &&
    sourceReceipt.state === 'source_ready' &&
    sourceReceipt.logical_assignments_executed_locally === 12 &&
    sourceReceipt.logical_assignment_limit === 12 &&
    sourceReceipt.reconciliation?.status === 'reconciled' &&
    sourceReceipt.reconciliation?.expected_lanes === 12 &&
    sourceReceipt.reconciliation?.returned_lanes === 12 &&
    sourceReceipt.systemia_policy_evaluated === true &&
    sourceReceipt.systemia_policy?.state === 'systemia_policy_plan_admitted' &&
    sourceReceipt.systemia_policy_matches_reconciled_program === true &&
    sourceReceipt.program_sha256 === sourceReceipt.systemia_policy?.program_sha256 &&
    Array.isArray(sourceReceipt.lanes) && sourceReceipt.lanes.length === 12 &&
    new Set(sourceReceipt.lanes.map(x=>x.lane_id)).size === 12 &&
    sourceReceipt.lanes.every(x=>x.source_state === 'source_anchors_found' &&
      x.runtime_observed === false);
  if (!source) add('SOURCE_AUDIT_NOT_RECEIPTED','12 source-ready Saban assignments and Systemia policy hash must reconcile');
  const security = writerAudit?.schema === 'evercraft.audit.github-workflow-writers.v1' &&
    writerAudit.ok === true && Array.isArray(writerAudit.findings) &&
    writerAudit.findings.length === 0;
  if(!security) add('WORKFLOW_WRITER_SECURITY_HOLD','Independent workflow-write audit has unresolved findings');
  // These cannot be inferred from a local CI runner, fabricated JS booleans,
  // or a successful device probe. They require separate external authorities.
  add('PHYSICAL_DEVICE_TRUST_NOT_VERIFIED','No independently verified Node001 + Node002 field provenance, broker and Yard receipts');
  add('LIVE_WORKER_PERMISSION_NOT_GRANTED','No Passport/Execution Gate authorization and signed real-node job result');
  add('PHYSICAL_FAILOVER_NOT_VERIFIED','Two ephemeral CI NodeSeeds are not a field two-machine proof');
  add('CUSTOMER_DELIVERY_NOT_VERIFIED','No settled payment to entitlement to actual product delivery receipt');
  add('PRODUCTION_RELEASE_NOT_AUTHORIZED','No approved release, independent deployment receipt or verified rollback');
  return {
    schema:'evercraft.os.release-readiness.v1',
    state:'held',
    release_decision:'deny_automatic_deployment',
    evidence_scope:'ci_source_and_workflow_inventory_only',
    source_readiness_proven:source,
    workflow_writer_audit_passed:security,
    workflow_security_findings:(writerAudit?.findings||[]).map(x=>({code:String(x.code),file:String(x.file)})),
    physical_field_nodes_verified:0,
    live_workloads_on_owned_devices_verified:0,
    completed_customer_purchases_verified:0,
    production_deployments_verified:0,
    self_reported_receipts_grant_production_authority:false,
    deploy_enabled:false,
    payment_execution_enabled:false,
    next_actions:[
      'Resolve unapproved workflow writers without altering the baseline or silently stopping society state continuity',
      'Verify original Node001/Node002 signed local identities with independent Device/Yard pins',
      'Obtain independently authenticated broker and exact device permissions',
      'Run one authorized physical two-host interruption-and-recovery canary',
      'Prove one real paid purchase through fulfillment and entitlement',
      'Review and separately authorize a release with rollback proof'
    ],
    blockers
  };
}

export function runReleaseReadiness({rootDir=root,outputFile=OUTPUT}={}){
  const sourcePath=resolve(rootDir,RECEIPT);
  const source=existsSync(sourcePath)?JSON.parse(readFileSync(sourcePath,'utf8')):null;
  const audit=auditWorkflowFiles({directory:resolve(rootDir,'.github/workflows'),
    baselinePath:resolve(rootDir,'audits/workflow-writer-baseline-2026-10-15.json')});
  const decision=assessOsRelease({sourceReceipt:source,writerAudit:audit});
  const body={...decision,source_receipt_sha256:source?digest(readFileSync(sourcePath)):null};
  const target=resolve(rootDir,outputFile);
  const allowed=resolve(rootDir,'artifacts/evercraft-os')+sep;
  if(!target.startsWith(allowed) || !target.endsWith('.json'))throw Error('release_readiness_output_outside_artifacts');
  mkdirSync(dirname(target),{recursive:true});
  const temp=target+'.'+process.pid+'.tmp';
  try{writeFileSync(temp,JSON.stringify(body,null,2)+'\n',{mode:0o600});renameSync(temp,target);}
  finally{rmSync(temp,{force:true});}
  return body;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try {
    const result=runReleaseReadiness({rootDir:process.cwd()});
    console.log(JSON.stringify({
      schema:result.schema,
      state:result.state,
      source_ready:result.source_readiness_proven,
      workflow_security_ready:result.workflow_writer_audit_passed,
      physical_node_authorization:false,
      production_deploy_enabled:false,
      blockers:result.blockers.map(x=>x.code)
    }));
    if(process.argv.includes('--require-release'))process.exitCode=1;
  } catch(error) {
    console.error('os_release_readiness_fail_closed:'+String(error?.message||error));
    process.exitCode=1;
  }
}
