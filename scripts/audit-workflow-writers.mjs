#!/usr/bin/env node
// Read-only, standard-library-only GitHub Actions authority sweep.
// IMPORTANT: this text-level gate is a conservative CI tripwire, not branch
// protection, script provenance analysis, a runner sandbox or a security audit.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const BASELINE_PATH = path.join(ROOT,'audits/workflow-writer-baseline-2026-10-15.json');
const DEFAULT_WORKFLOWS = path.join(ROOT,'.github/workflows');
const latest = (name) => String(name??'').replaceAll('\\','/');
const blobSha=(content)=>createHash('sha1').update('blob '+Buffer.byteLength(content)+'\\0').update(content).digest('hex');

export function enumerateWorkflows(directory=DEFAULT_WORKFLOWS){
  if(!fs.existsSync(directory))throw new Error('workflow_directory_missing');
  return fs.readdirSync(directory,{withFileTypes:true})
    .filter(e=>e.isFile()&&/\.ya?ml$/i.test(e.name))
    .map(e=>path.join(directory,e.name)).sort();
}

export function inspectWorkflow(source, relativePath){
  const text=String(source||'');
  const permissionsWrite=/^\s*contents:\s*write\s*(?:#.*)?$/im.test(text) ||
    /^\s*permissions:\s*write-all\s*(?:#.*)?$/im.test(text);
  // Include GitHub Actions YAML one-line steps: "- run: git push ...".
  // Also conservatively flag commands buried in multi-line scripts.
  const oidcTokenWrite=/^\s*id-token:\s*write\s*(?:#.*)?$/im.test(text);
  const uses=[...text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map(x=>x[1]);
  const unpinnedActions=uses.filter(x=>x.includes('@')&&!/@[a-f0-9]{40}$/.test(x));
  const pushCommand=/\bgit\s+(?:-C\s+\S+\s+)?push\b/im.test(text) ||
    /\bgh\s+api\s+[^\n]*(?:git\/refs|\/contents\/)/i.test(text);
  const directMainPush=/\bgit\s+push\b[^\n]*(?:HEAD:main|\borigin\s+main\b|\brefs\/heads\/main\b)/im.test(text);
  const broaderMainMutation=/(?:^|[\n])\s*git\s+(?:add|commit)\b/im.test(text)&&pushCommand;
  const prTarget=/^\s*pull_request_target\s*:/m.test(text);
  const writer=permissionsWrite||pushCommand;
  const pushes=String(text.match(/\bgit\s+push\b/g)?.length||0);
  const scheduled=/^\s*schedule\s*:/m.test(text);
  const dispatch=/^\s*workflow_dispatch\s*:/m.test(text);
  const mainTrigger=/branches:\s*\[\s*main\s*\]/m.test(text);
  const stagesPublicChum=/\bgit\s+add\b[^\n]*(?:\bpublic\/chum\b|\bpublic\s*$)/m.test(text);
  const stagesPayments=/\bgit\s+add\b[^\n]*(?:\bevercraft-payments-buyer-doors\.json\b|\bevercraft-chum\.json\b)/m.test(text);
  const obviousRisk=writer&&(prTarget||!permissionsWrite||stagesPayments);
  return {
    file: latest(relativePath),
    writer,
    contents_write:permissionsWrite,
    id_token_write:oidcTokenWrite,
    unpinned_action_references:unpinnedActions.length,
    pushes_to_main:directMainPush,
    has_push_command:pushCommand,
    mutating_git_script:broaderMainMutation,
    pulls_untrusted_pr_target:prTarget,
    schedule:scheduled,
    manual_dispatch:dispatch,
    main_trigger:mainTrigger,
    push_command_count:Number(pushes),
    public_chum_staging_risk:stagesPublicChum,
    protected_commercial_file_staging_risk:stagesPayments,
    immediately_review:obviousRisk,
  };
}

export function assessWriterInventory(items, baseline){
  if(!Array.isArray(items)||!baseline||!Array.isArray(baseline.existing_direct_main_writers)){
    throw new Error('workflow_audit_invalid_inputs');
  }
  const seen=new Set();const findings=[];
  const prior=new Set(baseline.existing_direct_main_writers);
  const priorOidc=new Set(baseline.existing_oidc_token_writers||[]);
  for(const item of items){
    if(seen.has(item.file))findings.push({code:'DUPLICATE_PATH',file:item.file});
    seen.add(item.file);
    if(item.id_token_write&&!priorOidc.has(item.file))
      findings.push({code:'NEW_UNAPPROVED_OIDC_TOKEN_WRITER',file:item.file});
    if(item.pulls_untrusted_pr_target&&(item.writer||item.id_token_write))
      findings.push({code:'UNTRUSTED_PR_TARGET_HAS_WRITE_AUTHORITY',file:item.file});
    if(item.has_push_command&&!item.contents_write)
      findings.push({code:'PUSH_WITHOUT_DECLARED_CONTENTS_WRITE',file:item.file});
    if(item.protected_commercial_file_staging_risk&&item.writer)
      findings.push({code:'DIRECT_STAGE_OF_PROTECTED_BUYER_CONTRACT',file:item.file});
    if(item.writer&&!prior.has(item.file)&&!item.isolated_writer_verified)
      findings.push({code:'NEW_UNAPPROVED_WORKFLOW_WRITER',file:item.file});
  }
  const writers=items.filter(x=>x.writer).map(x=>x.file).sort();
  const oidcWriters=items.filter(x=>x.id_token_write).map(x=>x.file).sort();
  const retired=[...prior].filter(x=>!writers.includes(x)).sort();
  const pushers=items.filter(x=>x.has_push_command).map(x=>x.file).sort();
  return {
    ok:findings.length===0,
    schema:'evercraft.audit.github-workflow-writers.v1',
    workflow_count:items.length,
    active_writer_count:writers.length,
    oidc_token_writer_count:oidcWriters.length,
    oidc_token_writers:oidcWriters,
    workflows_with_unpinned_actions:items.filter(x=>x.unpinned_action_references>0).length,
    unpinned_action_references:items.reduce((n,x)=>n+(x.unpinned_action_references||0),0),
    direct_main_push_count:items.filter(x=>x.pushes_to_main).length,
    writers,
    pushers,
    retired_baseline_writers:retired,
    review_priorities:items.filter(x=>x.writer).filter(x=>x.public_chum_staging_risk||x.immediately_review)
      .map(x=>({file:x.file,public_chum_staging_risk:x.public_chum_staging_risk,
        protected_file_stage:x.protected_commercial_file_staging_risk,
        main_trigger:x.main_trigger,schedule:x.schedule})),
    findings,
    limits:[
      'Text-level scanner: may miss scripts or actions that push indirectly, dynamically, or with alternate credentials.',
      'Allowed legacy writers remain risky; presence in baseline is inventory only, not security approval.',
      'CI cannot stop writes directly to an unprotected main branch. Branch ruleset/review requirement is a separate control.',
      'Unpinned third-party/action tag references are counted but not yet a release blocker; SHA pinning is a separate migration.',
    ],
  };
}

export function auditWorkflowFiles({directory=DEFAULT_WORKFLOWS,baselinePath=BASELINE_PATH}={}){
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
  const files=enumerateWorkflows(directory);
  const isolatedRows=Array.isArray(baseline.existing_isolated_society_state_writers)
    ? baseline.existing_isolated_society_state_writers:[];
  const worker=baseline.isolated_society_worker_source||{};
  let isolatedScriptSafe=false;
  if(worker.path==='systemia/society/window-heartbeat.mjs' &&
     /^[a-f0-9]{40}$/.test(worker.blob_sha||'')){
    const sourcePath=path.join(ROOT,worker.path);
    if(fs.existsSync(sourcePath)){
      const source=fs.readFileSync(sourcePath,'utf8');
      isolatedScriptSafe=blobSha(source)===worker.blob_sha &&
        source.includes("export const STATE_BRANCH='window-society-state';") &&
        source.includes("export const STATE_PATH='state/window.json';") &&
        source.includes('branch:STATE_BRANCH') &&
        source.includes('ref='+encodeURIComponent('STATE_BRANCH').replace('STATE_BRANCH','STATE_BRANCH'))===false;
      // The file is SHA-frozen above. No source edit is accepted until
      // the exact changed worker is reviewed and its blob SHA replaced.
    }
  }
  const entries=files.map(file=>{
    const source=fs.readFileSync(file,'utf8');
    const entry=inspectWorkflow(source,latest(path.relative(ROOT,file)));
    const matching=isolatedRows.filter(row=>row.file===entry.file);
    entry.isolated_writer_verified=Boolean(
      matching.length===1 && isolatedScriptSafe &&
      blobSha(source)===matching[0].blob_sha &&
      matching[0].state_branch==='window-society-state' &&
      matching[0].state_path==='state/window.json' &&
      source.includes('node systemia/society/window-heartbeat.mjs') &&
      !entry.pushes_to_main&&!entry.has_push_command &&
      !entry.pulls_untrusted_pr_target&&!entry.id_token_write &&
      !entry.protected_commercial_file_staging_risk);
    return entry;
  });
  return assessWriterInventory(entries,baseline);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditWorkflowFiles();
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.ok)process.exitCode=1;
}
