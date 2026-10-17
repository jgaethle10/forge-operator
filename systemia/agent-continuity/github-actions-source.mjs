// Owned GitHub Actions source adapter. READ ONLY: no dispatch/retry/cancel/permission writes.
// Authenticated GitHub API readback proves GitHub reported this workflow state,
// not that an Evercraft agent finished, that a provider committed effects, or that a
// response is authorized. Signing requires a SEPARATELY provisioned local key.
import {createHash} from 'node:crypto';
import {SCHEMA} from './incident-event.mjs';
const ID=/^[A-Za-z0-9_.:@/-]{1,160}$/;
const SHA=/^[a-f0-9]{40}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const providerChecked=new WeakSet();
const STATES=new Set(['queued','in_progress','completed','waiting','pending','requested','action_required']);
function hold(x){throw new Error('GITHUB_ACTIONS_READONLY_HELD: '+x);}
function timestamp(x){
  if(typeof x!=='string'||!UTC.test(x)||Number.isNaN(Date.parse(x))||new Date(x).toISOString().slice(0,19)!==x.slice(0,19))hold('invalid provider timestamp');
  return x;
}
function scope({repo,workflow,run_id,tenant_id,mission_id}){
  if(repo!=='jgaethle10/forge-operator')hold('owned repository scope not allowlisted');
  if(!['entire-blackbox-evidence.yml','revenue-autonomy-heartbeat.yml'].includes(workflow))hold('workflow not allowlisted');
  if(!Number.isSafeInteger(Number(run_id))||Number(run_id)<1||String(run_id).length>16)hold('invalid run identifier');
  if(tenant_id!=='evercraft'||mission_id!=='evercraft-agent-continuity-fabric-20261016')hold('tenant or mission not authorized for adapter');
}
function checkedGithubRun(run,config){
  scope(config);
  if(!run||typeof run!=='object'||Array.isArray(run))hold('missing provider run');
  if(run.id!==Number(config.run_id)||run.repository?.full_name!==config.repo)hold('provider run identity mismatch');
  if(run.path!=='.github/workflows/'+config.workflow)hold('provider workflow path mismatch');
  if(!SHA.test(run.head_sha))hold('missing commit identity');
  if(!STATES.has(run.status)||typeof run.run_attempt!=='number'||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1)hold('invalid GitHub run state');
  if(run.conclusion!==null && typeof run.conclusion!=='string')hold('invalid conclusion field');
  timestamp(run.created_at);
  if(run.run_started_at!==null&&run.run_started_at!==undefined)timestamp(run.run_started_at);
  if(run.html_url!=='https://github.com/'+config.repo+'/actions/runs/'+run.id)hold('provider run URL mismatch');
  const observation=Object.freeze({
    run_id:run.id,run_attempt:run.run_attempt,workflow_file:config.workflow,repository:config.repo,head_sha:run.head_sha,
    github_status:run.status,github_conclusion:run.conclusion,provider_created_at:run.created_at,provider_started_at:run.run_started_at||null,
    provider_url:run.html_url,
    evidence_boundary:'GITHUB_WORKFLOW_STATE_ONLY_NOT_AGENT_OR_EXTERNAL_EFFECT'
  });
  providerChecked.add(observation);
  return observation;
}
/** Call only from a token with actions:read; enforce exact GET endpoint, no redirects. */
export async function fetchOwnedGithubRun({repo,workflow,run_id,tenant_id,mission_id,token,fetcher=fetch}){
  const config={repo,workflow,run_id,tenant_id,mission_id};
  scope(config);
  if(typeof token!=='string'||token.length<8)hold('actions read token missing');
  const url='https://api.github.com/repos/'+repo+'/actions/runs/'+Number(run_id);
  const response=await fetcher(url,{
    method:'GET',redirect:'error',headers:{
      accept:'application/vnd.github+json',authorization:'Bearer '+token,
      'x-github-api-version':'2022-11-28','user-agent':'evercraft-blackbox-readonly-source'
    },signal:AbortSignal.timeout(12000)
  });
  if(!response?.ok)hold('provider GET failed with HTTP '+String(response?.status||'unknown'));
  const body=await response.text();
  if(Buffer.byteLength(body)>131072)hold('oversized GitHub response');
  let run;
  try{run=JSON.parse(body);}catch{hold('invalid provider JSON');}
  return checkedGithubRun(run,config);
}
/** A reported queue state is NOT evidence that surviving subprocesses are terminated. */
export function githubRunToIncidentEvent(observation,{tenant_id,mission_id,observed_at}){
  if(!observation||!providerChecked.has(observation))hold('not a provider-fetched checked source observation');
  const config={repo:observation.repository,workflow:observation.workflow_file,run_id:observation.run_id,tenant_id,mission_id};
  scope(config);
  timestamp(observed_at);
  const stable=JSON.stringify([observation.repository,observation.run_id,observation.run_attempt,observation.github_status,observation.github_conclusion]);
  const fingerprint=createHash('sha256').update(stable).digest('hex').slice(0,24);
  const runRef='workflow-run-'+observation.run_id;
  return {
    schema:SCHEMA,tenant_id,mission_id,
    incident_id:'github-workflow-'+observation.run_id,
    event_id:'github-state-'+fingerprint,source_id:'owned-github-actions-readback',
    agent_id:'github-actions-observer',workload_id:runRef,operation_id:runRef,
    occurred_at:observation.provider_started_at||observation.provider_created_at,
    observed_at,clock_uncertainty_ms:30000,event_type:'queue_snapshot',
    evidence_kind:'source_report',actor_id:'github-actions-readonly-adapter',permission_scope:'audit:read',
    idempotency_key:'github-run-'+observation.run_id+'-attempt-'+observation.run_attempt,
    upstream_event_ids:[],
    persistence_paths:[{type:'queue',resource_id:runRef,state:'reported'}],
    possible_impact:[],verified_impact:[],external_effect:'UNKNOWN'
  };
}
