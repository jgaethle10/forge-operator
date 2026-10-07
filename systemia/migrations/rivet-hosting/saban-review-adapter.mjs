import fs from 'node:fs';
import path from 'node:path';

function finding(code,severity,detail){
  return {code,severity,detail};
}

function includes(value,needle){
  return JSON.stringify(value||'').toLowerCase().includes(String(needle).toLowerCase());
}

export async function runAssignment({assignment,rootDir}){
  const option=assignment?.item?.raw||{};
  const role=assignment?.role||'reviewer';
  const findings=[];

  if(option.brand_control!=='RIVET partners'){
    findings.push(finding('brand_authority_not_partner_controlled','P0','RIVET presentation authority must remain with the RIVET partners.'));
  }

  if(role==='brand_guard'){
    if(!includes(option,'approved RIVET')&&!includes(option,'brand_control')){
      findings.push(finding('brand_fidelity_not_explicit','P1','Hosting lane does not explicitly preserve the approved RIVET presentation.'));
    }
  }

  if(role==='partner_control_guard'){
    if(option.id==='evercraft_owned'){
      findings.push(finding('partner_infrastructure_control_delegated','REVIEW','Evercraft would control the hosting account. Partners must explicitly accept that operating boundary.'));
    }
    if(option.id==='hybrid_partner_frontend_evercraft_backend'){
      findings.push(finding('split_operational_authority','REVIEW','Hybrid hosting needs written incident ownership and API authority boundaries.'));
    }
  }

  if(role==='reliability_guard'){
    if(option.id==='evercraft_owned'){
      findings.push(finding('rivet_public_reliability_not_yet_proven','P1','Evercraft control-plane behavior is proven, but a partner-approved RIVET public production route and SLA are not.'));
    }else{
      findings.push(finding('provider_availability_is_not_rivet_readiness','REVIEW','Commercial provider availability does not prove this RIVET deployment, backups, health checks or recovery path.'));
    }
  }

  if(role==='cost_guard'){
    if(!option.recurring_external_hosting_cost){
      findings.push(finding('cost_model_missing','P1','No recurring hosting cost model is recorded.'));
    }
    if(option.id==='evercraft_owned'){
      findings.push(finding('evercraft_operating_cost_unpriced','REVIEW','Do not call Evercraft hosting free. Capacity, redundancy, labor, monitoring and support need measured cost.'));
    }
  }

  if(role==='rollback_guard'){
    const runbook=path.join(rootDir,'governance/rivet-hosting-migration/CUTOVER-RUNBOOK.md');
    if(!fs.existsSync(runbook)) findings.push(finding('rollback_runbook_missing','P0','Migration package has no rollback runbook.'));
    const text=fs.existsSync(runbook)?fs.readFileSync(runbook,'utf8'):'';
    if(!/Rollback uses the preserved DNS\/routing state/i.test(text)){
      findings.push(finding('rollback_mechanism_not_explicit','P1','Rollback must preserve prior DNS/routing and release state.'));
    }
  }

  if(role==='portability_guard'){
    if(option.id==='vercel_pro'){
      findings.push(finding('platform_coupling_risk','REVIEW','Vercel is operationally convenient, but framework and platform coupling should be evaluated before adoption.'));
    }
    if(option.id==='hybrid_partner_frontend_evercraft_backend'){
      findings.push(finding('api_contract_required_for_replaceability','REVIEW','Hybrid portability depends on a versioned replaceable backend contract.'));
    }
  }

  if(role==='security_guard'){
    findings.push(finding('security_proof_required_before_cutover','REVIEW','Account access, secret rotation, TLS, backup/restore and incident ownership remain pre-cutover proof gates.'));
  }

  if(role==='data_authority_guard'){
    if(option.id==='hybrid_partner_frontend_evercraft_backend'||option.id==='evercraft_owned'){
      findings.push(finding('backend_data_authority_must_be_explicit','REVIEW','Evercraft backend access must be limited to the data and actions explicitly authorized by the partners.'));
    }
  }

  if(role==='infrastructure_skeptic'){
    if(option.readiness==='commercially_available'){
      findings.push(finding('provider_exists_but_rivet_not_deployed','REVIEW','A purchasable hosting product is not evidence that RIVET is configured, secure or recoverable there.'));
    }
    if(option.id==='evercraft_owned'){
      findings.push(finding('owned_stack_maturity_gap','P1','Do not promote the owned lane until RIVET-specific external route, uptime and recovery evidence exist.'));
    }
  }

  return {
    schema:'evercraft.rivet.hosting-review-finding-set.v1',
    status:findings.some(x=>x.severity==='P0')?'blocked':findings.length?'finding':'clean',
    option_id:option.id,
    option_label:option.label,
    role,
    findings,
    production_mutation:false,
    migration_authority_granted:false
  };
}

export async function reconcile({results}){
  const rows=(results||[]).filter(Boolean);
  const byOption=new Map();
  for(const row of rows){
    if(!byOption.has(row.option_id)) byOption.set(row.option_id,{option_id:row.option_id,label:row.option_label,roles:[],findings:[]});
    const entry=byOption.get(row.option_id);
    entry.roles.push(row.role);
    entry.findings.push(...(row.findings||[]).map(f=>({...f,role:row.role})));
  }
  const options=[...byOption.values()].map(entry=>({
    ...entry,
    roles:[...new Set(entry.roles)].sort(),
    blocker_count:entry.findings.filter(f=>f.severity==='P0').length,
    p1_count:entry.findings.filter(f=>f.severity==='P1').length,
    review_count:entry.findings.filter(f=>f.severity==='REVIEW').length
  }));
  return {
    schema:'evercraft.rivet.hosting-review-reconciliation.v1',
    status:'reconciled',
    options,
    production_lane_selected:false,
    production_mutation:false,
    migration_authority_granted:false,
    doctrine:{
      hosting_is_not_brand_authority:true,
      provider_availability_is_not_deployment_proof:true,
      blocked_is_never_pass:true
    }
  };
}
