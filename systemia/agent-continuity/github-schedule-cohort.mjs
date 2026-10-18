import {createHash} from 'node:crypto';
import {SCHEMA} from './incident-event.mjs';
// Read-only provider-authoritative SCHEDULE cohort. No workflow dispatch,
// health promotion, provider effect inference, credentials in receipt, or agent action.
// Correlated stale scheduled runs do not prove GitHub's root cause.
export const COHORT = Object.freeze([
  {key:'revenue_supervisor',workflow:'revenue-autonomy-heartbeat.yml',fresh_ms:45*60000},
  {key:'portfolio_sentinel',workflow:'systemia-portfolio-sentinel.yml',fresh_ms:20*60000},
  {key:'legacy_rescue',workflow:'systemia-legacy-rescue-watch.yml',fresh_ms:20*60000},
  {key:'commercial_discovery',workflow:'portfolio-sentinel-commercial-discovery.yml',fresh_ms:45*60000},
  {key:'chum_watershed',workflow:'chum-watershed.yml',fresh_ms:420*60000}
]);
const REPO='jgaethle10/forge-operator';
const sourceChecked=new WeakSet();
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
function hold(code){throw new Error('BLACKBOX_SCHEDULE_COHORT_HELD: '+code);}
function when(x){
 if(typeof x!=='string'||!UTC.test(x)||Number.isNaN(Date.parse(x))||new Date(x).toISOString().slice(0,19)!==x.slice(0,19))hold('INVALID_GITHUB_TIME');
 return Date.parse(x);
}
async function getJson(url,token,fetcher){
 const response=await fetcher(url,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,
     'x-github-api-version':'2022-11-28','user-agent':'evercraft-blackbox-schedule-cohort'}
 });
 if(!response?.ok)hold('GITHUB_HTTP_'+String(response?.status??'UNKNOWN'));
 const text=await response.text();
 if(Buffer.byteLength(text)>180000)hold('PROVIDER_BODY_TOO_LARGE');
 try{return JSON.parse(text);}catch{hold('PROVIDER_JSON_INVALID');}
}
function runCheck(row,workflow){
 if(!row||typeof row!=='object'||Array.isArray(row)||!Number.isSafeInteger(row.id)||row.id<1 ||
   row.repository?.full_name!==REPO||row.path!=='.github/workflows/'+workflow||
   row.event!=='schedule'||row.head_branch!=='main'||typeof row.head_sha!=='string'||!/^[a-f0-9]{40}$/.test(row.head_sha)||
   row.html_url!=='https://github.com/'+REPO+'/actions/runs/'+row.id||
   !Number.isSafeInteger(row.run_attempt)||row.run_attempt<1||
   !['queued','in_progress','completed','waiting','pending','requested','action_required'].includes(row.status)||
   (row.conclusion!==null&&typeof row.conclusion!=='string'))hold('SCHEDULED_RUN_IDENTITY_MISMATCH');
 when(row.created_at);
 return row;
}
export async function observeScheduledCohort({repo=REPO,token,now=Date.now(),fetcher=fetch}={}){
 if(repo!==REPO||typeof token!=='string'||token.length<8||!Number.isSafeInteger(now))hold('READONLY_SCOPE_OR_TOKEN_INVALID');
 const lanes=[];
 for(const lane of COHORT){
  const workflow=lane.workflow;
  const base='https://api.github.com/repos/'+REPO+'/actions/workflows/'+workflow;
  const list=await getJson(base+'/runs?event=schedule&branch=main&per_page=3',token,fetcher);
  if(!list||!Array.isArray(list.workflow_runs)||list.workflow_runs.length>3)hold('LIST_SCHEMA_INVALID');
  if(!list.workflow_runs.length){
   lanes.push({lane:lane.key,workflow,schedule_state:'HELD_MISSING',last_scheduled_run_id:null,
     age_ms:null,github_run_state:null,github_conclusion:null,run_url:null,provider_list_count:0});
   continue;
  }
  let selected=null;
  for(const row of list.workflow_runs){
   runCheck(row,workflow);
   const created_ms=when(row.created_at),age_ms=now-created_ms;
   if(age_ms< -60000)hold('FUTURE_SCHEDULED_RUN');
   if(!selected||created_ms>selected.created_ms)selected={id:row.id,created_ms,age_ms,created_at:row.created_at};
  }
  // Exact detail readback is required; a list item alone cannot certify a source.
  const run=runCheck(await getJson('https://api.github.com/repos/'+REPO+'/actions/runs/'+selected.id,token,fetcher),workflow);
  if(run.id!==selected.id||run.created_at!==selected.created_at)hold('LIST_DETAIL_DISAGREE');
  const state=selected.age_ms>lane.fresh_ms?'HELD_STALE':
    run.status==='completed'&&run.conclusion==='success'?'FRESH_SUCCESSFUL_GITHUB_WORKFLOW':
    run.status==='completed'?'HELD_GITHUB_WORKFLOW_FAILED_OR_NON_SUCCESS':'HELD_IN_FLIGHT_NOT_COMPLETED';
  lanes.push({lane:lane.key,workflow,schedule_state:state,last_scheduled_run_id:run.id,
    created_at:run.created_at,age_ms:selected.age_ms,max_age_ms:lane.fresh_ms,
    github_run_state:run.status,github_conclusion:run.conclusion,run_url:run.html_url,
    provider_list_count:list.workflow_runs.length});
 }
 const stale=lanes.filter(x=>x.schedule_state==='HELD_STALE'||x.schedule_state==='HELD_MISSING');
 const failures=lanes.filter(x=>x.schedule_state==='HELD_GITHUB_WORKFLOW_FAILED_OR_NON_SUCCESS');
 const fresh=lanes.filter(x=>x.schedule_state==='FRESH_SUCCESSFUL_GITHUB_WORKFLOW');
 const observed_clusters=stale.length>=3?'MULTIPLE_SCHEDULE_GAPS_PROVIDER_OBSERVED':'INSUFFICIENT_COHORT_GAP';
 const result=Object.freeze({
   schema:'evercraft.blackbox.github-scheduled-cohort.v1',observed_at:new Date(now).toISOString(),
   repository:REPO,source:'GITHUB_ACTIONS_SCHEDULE_EVENT_EXACT_READBACK',source_scope:'OWNER_REPOSITORY_GITHUB_WORKFLOW_ONLY',
   lanes,summary:{cohort_size:lanes.length,stale_or_missing:stale.length,fresh_workflow_successes:fresh.length,
     non_successful_recent_runs:failures.length,observed_clusters},
   common_cause_verified:false,
   hosted_scheduler_root_cause:'UNKNOWN',
   service_recovery_verified:false,actual_agent_telemetry_verified:false,
   source_execution_authority:'NONE_READ_ONLY',
   interpretation:'Schedule state is provider GitHub Actions state only; a success is not proof of downstream agent or revenue.'
 });
 sourceChecked.add(result);
 return result;
}


/**
 * Convert a provider-fetched cohort into ONE bounded shared READ-ONLY incident.
 * Absence from provider list is not silently converted into a signed run record.
 * Only exact provider-run items are emitted. Missing lanes remain in cohort receipt.
 */
export function cohortToSharedIncidentEvents(cohort,{tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016'}={}){
 if(!cohort||!sourceChecked.has(cohort))hold('COHORT_NOT_AUTHENTICATED_IN_PROCESS');
 if(tenant_id!=='evercraft'||mission_id!=='evercraft-agent-continuity-fabric-20261016')hold('COHORT_MISSION_SCOPE_MISMATCH');
 const observations=cohort.lanes.filter(l=>l.last_scheduled_run_id!=null);
 const incident_id='schedule-cohort-'+cohort.observed_at.slice(0,13).replaceAll(':','-');
 const events=observations.map(l=>{
   const runRef='github-run-'+l.last_scheduled_run_id;
   const workflowRef=l.workflow.replace('.yml','').replaceAll('_','-');
   const v=JSON.stringify([cohort.repository,l.last_scheduled_run_id,l.github_run_state,l.github_conclusion]);
   const event_id='scheduled-'+createHash('sha256').update(v).digest('hex').slice(0,24);
   return {
     schema:SCHEMA,tenant_id,mission_id,incident_id,event_id,
     source_id:'owned-github-actions-cohort',agent_id:'github-actions-observer',
     workload_id:workflowRef,operation_id:runRef,occurred_at:l.created_at,
     observed_at:cohort.observed_at,clock_uncertainty_ms:30000,
     event_type:'queue_snapshot',evidence_kind:'source_report',
     actor_id:'github-schedule-cohort-lab',permission_scope:'audit:read',
     idempotency_key:'github-schedule-run-'+l.last_scheduled_run_id,
     upstream_event_ids:[],persistence_paths:[{type:'queue',resource_id:runRef,state:'reported'}],
     possible_impact:[],verified_impact:[],external_effect:'UNKNOWN'
   };
 });
 if(new Set(events.map(e=>e.event_id)).size!==events.length)hold('COHORT_EVENT_COLLISION');
 return {schema:'evercraft.blackbox.cohort-packet-prepared.v1',incident_id,
   observed_at:cohort.observed_at,events,
   excluded_missing_lanes:cohort.lanes.filter(l=>l.last_scheduled_run_id==null).map(l=>l.lane),
   live_agent_verification:false,external_effect_verification:false,
   semantic_edges:'TEMPORAL_CORRELATION_ONLY_NOT_CAUSATION',
   execution_authority:'NONE_READ_ONLY'};
}
