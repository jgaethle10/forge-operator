import fs from 'node:fs';
import path from 'node:path';
import { harvestSource } from './public-session-harvester.mjs';

const clean=value=>String(value||'').replace(/[^A-Za-z0-9 _-]+/g,' ').trim();

async function fetchJson(url,{timeoutMs=15000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{headers:{'user-agent':'Evercraft-RIVET-Saban-Source-Hunter/1.0'},signal:controller.signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

async function huntDataGov(raw){
  const query=[clean(raw.jurisdiction||''),'electric vehicle charging station usage sessions'].filter(Boolean).join(' ');
  const url=new URL('https://catalog.data.gov/api/3/action/package_search');
  url.searchParams.set('q',query);
  url.searchParams.set('rows','8');
  const payload=await fetchJson(url.toString());
  return (payload?.result?.results||[]).map(item=>({
    source_catalog:'data.gov',
    dataset_id:item.id||null,
    title:item.title||null,
    organization:item.organization?.title||null,
    landing_url:item.url||null,
    notes:String(item.notes||'').slice(0,500)
  }));
}

export async function runAssignment({assignment}){
  const raw=assignment?.item?.raw||{};
  const role=assignment?.role;
  const base={
    schema:'evercraft.rivet.session-saban-finding.v1',
    status:'completed',
    agent_id:assignment?.agent_id,
    role,
    work:assignment?.work,
    boundaries:{
      no_auth_bypass:true,
      no_rate_limit_evasion:true,
      no_private_dashboard_scraping:true,
      no_purchase_or_outreach:true,
      observed_only_for_session_coverage:true,
      drop_user_identifiers:true
    }
  };

  try{
    if(role==='source_hunter'&&raw.kind==='session_acquisition_work'&&raw.authority==='public'){
      if(raw.lane_id==='state-open-data'){
        return {...base,finding:'catalog_candidates',jurisdiction:raw.jurisdiction,lane_id:raw.lane_id,candidates:await huntDataGov(raw)};
      }
      return {...base,finding:'lane_hunt_plan',jurisdiction:raw.jurisdiction,lane_id:raw.lane_id,objective:raw.objective};
    }
    if(role==='harvester'&&raw.kind==='session_source'){
      const harvested=await harvestSource(raw,{maxPages:1});
      return {
        ...base,
        finding:'bounded_source_probe',
        source_id:raw.source_id,
        harvest_status:harvested.status,
        raw_session_rows_seen:harvested.raw_session_rows_seen||0,
        accepted_aggregate_rows:harvested.accepted_aggregate_rows||0,
        duplicate_rows_dropped:harvested.duplicate_rows_dropped||0
      };
    }
    if(role==='schema_cartographer'){
      return {...base,finding:'schema_gate',required:['stable_site_identity','geography','period_start','observed_session_count','provenance'],source_id:raw.source_id||null};
    }
    if(role==='adapter_builder'){
      return {...base,finding:'adapter_state',source_id:raw.source_id||null,auto_harvest:raw.auto_harvest===true,transport:raw.transport||null};
    }
    if(role==='provenance_guard'){
      return {...base,finding:'provenance_gate',authority:raw.authority||null,accepted:raw.authority==='public'||raw.authority==='user_authorized'};
    }
    if(role==='privacy_guard'){
      return {...base,finding:'privacy_gate',persist_raw_session_identifiers:false,aggregate_at_ingest:true};
    }
    if(role==='coverage_radar'){
      return {...base,finding:'coverage_target',jurisdiction:raw.jurisdiction||null,source_id:raw.source_id||null};
    }
    return {...base,finding:'no_op'};
  }catch(error){
    return {...base,finding:'legitimately_blocked',error:error instanceof Error?error.message:String(error)};
  }
}

export async function reconcile({results,rootDir}){
  const candidates=[];
  const sourceProbes=[];
  const blocks=[];
  for(const row of results||[]){
    for(const candidate of row?.candidates||[])candidates.push(candidate);
    if(row?.finding==='bounded_source_probe'){
      sourceProbes.push({
        source_id:row.source_id,
        status:row.harvest_status,
        raw_session_rows_seen:row.raw_session_rows_seen,
        accepted_aggregate_rows:row.accepted_aggregate_rows,
        duplicate_rows_dropped:row.duplicate_rows_dropped
      });
    }
    if(row?.finding==='legitimately_blocked')blocks.push({work:row.work,error:row.error});
  }

  const dedup=new Map();
  for(const candidate of candidates){
    const key=candidate.dataset_id||String(candidate.title)+'|'+String(candidate.organization);
    if(key&&!dedup.has(key))dedup.set(key,candidate);
  }

  const receipt={
    schema:'evercraft.rivet.session-saban-reconciliation.v1',
    status:'reconciled',
    generated_at:new Date().toISOString(),
    candidate_datasets:[...dedup.values()],
    source_probes:sourceProbes,
    legitimate_blocks:blocks,
    boundaries:{purchases:0,outreach:0,auth_bypasses:0,private_data_claims:0}
  };
  const out=path.join(rootDir,'artifacts/rivet-session-sprawl/saban-reconciliation-latest.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
