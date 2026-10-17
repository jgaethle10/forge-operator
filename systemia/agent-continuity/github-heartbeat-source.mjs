// Fail-closed, READ-ONLY GitHub scheduled revenue-supervisor observation.
// Does not inspect protected workflow artifacts, run jobs, external transactions,
// signed worker leases, agent memory, or autonomous response authority.
import {fetchOwnedGithubRun} from './github-actions-source.mjs';

const OWNED_REPO='jgaethle10/forge-operator';
const HEARTBEAT='revenue-autonomy-heartbeat.yml';
const MISSION='evercraft-agent-continuity-fabric-20261016';
function hold(reason){throw new Error('HEARTBEAT_SOURCE_HELD: '+reason);}
function held(state,{observed_at,source_query,source_count=0,detail=null}={}) {
  return Object.freeze({
    schema:'evercraft.blackbox.github-heartbeat-observation.v1',
    source_state:state,observed_at,source_query,
    source_count,run:null,detail,
    provider:'GITHUB_ACTIONS_READONLY',
    agent_execution_verified:false,side_effects_verified:false,execution_authority:'NONE_READ_ONLY'
  });
}
function requestArgs(token){
 return {method:'GET',redirect:'error',headers:{
    accept:'application/vnd.github+json',
    authorization:'Bearer '+token,
    'x-github-api-version':'2022-11-28',
    'user-agent':'evercraft-blackbox-readonly-heartbeat'
  },signal:AbortSignal.timeout(12000)};
}
/**
 * An observed recent *scheduled workflow run* is not a healthy business lane.
 * GitHub schedules may be delayed, and a success status doesn't attest output.
 * A missing/stale scheduled run remains a HOLD, not proof that no agents run.
 */
export async function fetchScheduledRevenueHeartbeat({
  repo=OWNED_REPO,tenant_id='evercraft',mission_id=MISSION,
  token,now=Date.now(),max_age_ms=45*60_000,fetcher=fetch
}={}){
  if(repo!==OWNED_REPO||tenant_id!=='evercraft'||mission_id!==MISSION)hold('unauthorized scope');
  if(typeof token!=='string'||token.length<8)hold('read-only token missing');
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(max_age_ms)||max_age_ms<60_000||max_age_ms>24*60*60_000)hold('invalid freshness window');
  const url='https://api.github.com/repos/'+repo+'/actions/workflows/'+HEARTBEAT+'/runs?event=schedule&branch=main&per_page=5';
  const observed_at=new Date(now).toISOString();
  const res=await fetcher(url,requestArgs(token));
  if(!res?.ok)hold('list scheduled runs HTTP '+String(res?.status??'unknown'));
  const raw=await res.text();
  if(Buffer.byteLength(raw)>262144)hold('oversized list response');
  let data;
  try{data=JSON.parse(raw);}catch{hold('invalid listing JSON');}
  if(!data||!Array.isArray(data.workflow_runs)||data.workflow_runs.length>5)hold('invalid scheduled-run listing');
  if(data.workflow_runs.length===0)return held('HELD_NO_PROVIDER_SCHEDULED_RUN',{observed_at,source_query:'EVENT_SCHEDULE_BRANCH_MAIN',source_count:0});
  const candidates=data.workflow_runs.map(row=>{
    if(!row||row.event!=='schedule'||row.head_branch!=='main'||
      row.repository?.full_name!==OWNED_REPO||row.path!=='.github/workflows/'+HEARTBEAT||
      !Number.isSafeInteger(row.id)||row.id<=0||
      typeof row.created_at!=='string'||Number.isNaN(Date.parse(row.created_at)))
       hold('scheduled-run list contains mismatched or malformed identity');
    const age_ms=now-Date.parse(row.created_at);
    if(age_ms < -60000)hold('provider run created in future');
    return {id:row.id,age_ms,created_at:row.created_at};
  }).sort((a,b)=>a.age_ms-b.age_ms||b.id-a.id);
  const pick=candidates[0];
  // Re-read the exact provider run, not a caller-provided JSON object from list.
  const observation=await fetchOwnedGithubRun({
    repo,workflow:HEARTBEAT,run_id:pick.id,tenant_id,mission_id,token,fetcher
  });
  if(observation.trigger_event!=='schedule'||observation.provider_created_at!==pick.created_at)
    hold('detail readback disagrees with scheduled run listing');
  const state=pick.age_ms<=max_age_ms?'SCHEDULED_RUN_PROVIDER_OBSERVED':'HELD_STALE_SCHEDULED_RUN';
  return Object.freeze({
    schema:'evercraft.blackbox.github-heartbeat-observation.v1',
    source_state:state,observed_at,source_query:'EVENT_SCHEDULE_BRANCH_MAIN',
    source_count:data.workflow_runs.length,run:observation,
    detail:{
      scheduled_run_age_ms:pick.age_ms,staleness_limit_ms:max_age_ms,
      provider_run_state:observation.github_status,provider_conclusion:observation.github_conclusion,
      provider_trigger_event:observation.trigger_event,latest_run_url:observation.provider_url
    },
    provider:'GITHUB_ACTIONS_READONLY',
    agent_execution_verified:false,side_effects_verified:false,execution_authority:'NONE_READ_ONLY'
  });
}


/** Read the GitHub workflow's actual active/disabled configuration separately.
 *  A YAML cron declaration is not evidence that GitHub has enabled its schedule.
 */
export async function fetchRevenueHeartbeatWorkflowConfiguration({
  repo=OWNED_REPO,token,fetcher=fetch
}={}){
  if(repo!==OWNED_REPO)hold('workflow config wrong repository');
  if(typeof token!=='string'||token.length<8)hold('workflow config read token missing');
  const url='https://api.github.com/repos/'+repo+'/actions/workflows/'+HEARTBEAT;
  const res=await fetcher(url,requestArgs(token));
  if(!res?.ok)hold('workflow metadata HTTP '+String(res?.status??'unknown'));
  const raw=await res.text();
  if(Buffer.byteLength(raw)>131072)hold('oversized workflow metadata');
  let data;
  try{data=JSON.parse(raw);}catch{hold('invalid workflow metadata JSON');}
  if(!data||!Number.isSafeInteger(data.id)||data.id<1)hold('workflow metadata invalid numeric id');
  if(data.path!=='.github/workflows/'+HEARTBEAT)hold('workflow metadata path mismatch');
  const expectedByPath='https://github.com/'+repo+'/actions/workflows/'+HEARTBEAT;
  const expectedById='https://github.com/'+repo+'/actions/workflows/'+data.id;
  const expectedSourceBlob='https://github.com/'+repo+'/blob/main/.github/workflows/'+HEARTBEAT;
  if(![expectedByPath,expectedById,expectedSourceBlob].includes(data.html_url))hold('workflow metadata URL mismatch');
  if(typeof data.state!=='string'||!['active','disabled_manually','disabled_inactivity','deleted'].includes(data.state))
    hold('workflow metadata state unsupported');
  return Object.freeze({
    provider:'GITHUB_ACTIONS_READONLY',
    workflow_id:data.id,workflow_file:HEARTBEAT,
    provider_workflow_state:data.state,
    provider_url:data.html_url,
    metadata_readback_verified:true,
    scheduler_dispatch_authorized:false,
    effective_scheduler_cadence_verified:false,
    source_boundary:'WORKFLOW_CONFIGURATION_NOT_CRON_DELIVERY_OR_AGENT_EXECUTION'
  });
}
