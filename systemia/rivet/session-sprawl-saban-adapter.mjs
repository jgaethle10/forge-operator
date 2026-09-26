import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_LANES=new Set(['state-open-data','federal-funded-publication','grant-project-reports','operator-utility-public']);
const REQUEST_LANES=new Set(['public-records-candidate']);
const PARTNER_LANES=new Set(['licensed-utilization-provider','cpo-direct-feed','customer-partner-upload']);

function norm(v){return String(v||'').trim()}
function queryFor(work){
  const j=norm(work?.jurisdiction);
  const lane=norm(work?.lane_id);
  const place=j==='US'?'United States':j;
  if(lane==='state-open-data') return `"${place}" EV charging sessions open data site usage charger utilization`;
  if(lane==='federal-funded-publication') return `"${place}" NEVI CFI EV charging sessions utilization report`;
  if(lane==='grant-project-reports') return `"${place}" EV charging grant project report sessions kWh utilization`;
  if(lane==='operator-utility-public') return `"${place}" utility EV charging sessions station usage public report`;
  if(lane==='public-records-candidate') return `"${place}" EV charger usage data public records agency utility`;
  if(lane==='licensed-utilization-provider') return 'US nationwide EV charging utilization sessions licensed data provider API';
  if(lane==='cpo-direct-feed') return 'US EV charging operator OCPI CDR session data partner feed';
  if(lane==='customer-partner-upload') return 'EV charging session export schema ChargePoint EVgo Tesla utility site-host';
  return `${place} EV charging sessions`;
}

export async function runAssignment({assignment,executionContext={}}){
  const work=assignment?.work||{};
  const role=norm(assignment?.role);
  const lane=norm(work?.lane_id);
  const jurisdiction=norm(work?.jurisdiction);
  const search_query=queryFor(work);
  const receipt={
    schema:'evercraft.rivet.session-sprawl-assignment-receipt.v1',
    mission_id:'rivet-us-session-sprawl-001',
    agent_id:assignment?.agent_id||null,
    role,
    jurisdiction,
    lane_id:lane,
    authority:work?.authority||null,
    search_query,
    canonical_entity:'EVObservedUsageAggregate',
    observed_session_gate:'charging_sessions_count + site identity + geography + period + provenance',
    modeled_promotion_forbidden:true,
    unsolicited_outreach:false,
    purchases_allowed:false,
    records_requests_allowed:false,
    status:'TASK_READY'
  };

  if(PUBLIC_LANES.has(lane)){
    receipt.instructions=[
      'Find official/public sources first.',
      'Require site/address or coordinates and a real observed charging-session count to count as session coverage.',
      'Capture source URL, period, site identity, session count, energy if available, license/terms and source vintage.',
      'Inventory, AADT, availability and modeled utilization are leads only, never observed sessions.'
    ];
  } else if(REQUEST_LANES.has(lane)){
    receipt.status='AUTHORITY_BLOCKED_REQUEST_CANDIDATE_ONLY';
    receipt.instructions=['Identify the likely records holder and releasable record description. Do not send a request.'];
  } else if(PARTNER_LANES.has(lane)){
    receipt.status='AUTHORITY_BLOCKED_PARTNER_CANDIDATE_ONLY';
    receipt.instructions=['Evaluate technical/data fit only. Do not purchase, accept terms, contact a provider, or create obligations.'];
  }

  if(typeof executionContext?.sessionSearch==='function'){
    const result=await executionContext.sessionSearch({query:search_query,work,role});
    receipt.search_result=result;
    receipt.status='SEARCH_EXECUTED';
  }
  return receipt;
}

export function reconcile({results=[]}={}){
  const rows=Array.isArray(results)?results:[];
  const byStatus={};
  for(const r of rows){const s=r?.status||r?.result?.status||'unknown';byStatus[s]=(byStatus[s]||0)+1;}
  return {
    schema:'evercraft.rivet.session-sprawl-reconciliation.v1',
    mission_id:'rivet-us-session-sprawl-001',
    assignments:rows.length,
    status_counts:byStatus,
    rule:'Only independently verified site-resolved observed charging-session counts may graduate into EVObservedUsageAggregate.'
  };
}
