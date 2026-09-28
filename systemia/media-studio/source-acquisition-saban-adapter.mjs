const ROLES=new Set([
  'subject_match_guard',
  'rights_guard',
  'provenance_guard',
  'documentary_truth_guard',
  'artifact_guard'
]);

function pair(item){
  const raw=item?.raw||item||{};
  return {
    request:raw.request||item?.request,
    candidate:raw.candidate||item?.candidate
  };
}

function inspect(role,request,candidate){
  const findings=[];
  if(!request?.id) findings.push('request_missing');
  if(!candidate?.id) findings.push('candidate_missing');

  if(role==='subject_match_guard'){
    const m=candidate?.visualMatch;
    if(candidate?.subjectId!==request?.subjectId) findings.push('subject_id_mismatch');
    if(m?.verifierState!=='verified') findings.push('visual_match_not_verified');
    if(m?.candidateId!==candidate?.id) findings.push('visual_match_candidate_mismatch');
    if(m?.subjectId!==request?.subjectId) findings.push('visual_match_subject_mismatch');
    if(!Number.isFinite(Number(m?.score))||!Number.isFinite(Number(m?.threshold))||Number(m.score)<Number(m.threshold)){
      findings.push('visual_match_below_threshold');
    }
    if(!Array.isArray(m?.evidenceRefs)||!m.evidenceRefs.length) findings.push('visual_match_evidence_missing');
  }

  if(role==='rights_guard'){
    if(['restricted','unknown'].includes(candidate?.rights)) findings.push('rights_not_admissible');
    if(request?.commercialUseRequired&&candidate?.commercialUseAllowed!=='yes') findings.push('commercial_use_not_verified');
  }

  if(role==='provenance_guard'){
    if(!candidate?.provenance?.sourceId) findings.push('provenance_source_id_missing');
    if(!candidate?.provenance?.rightsBasis) findings.push('provenance_rights_basis_missing');
    if(candidate?.rights==='licensed'&&!candidate?.provenance?.licenseId) findings.push('license_id_missing');
  }

  if(role==='documentary_truth_guard'){
    if(
      request?.preferredTreatment==='documentary_or_verified_visualization' &&
      candidate?.visualState==='synthetic_visualization'
    ) findings.push('synthetic_cannot_satisfy_source_first_documentary_acquisition');
  }

  if(role==='artifact_guard'){
    if(!candidate?.artifactPath) findings.push('artifact_path_missing');
    if(!/^sha256:[a-f0-9]{64}$/i.test(String(candidate?.artifactDigest||''))){
      findings.push('artifact_digest_missing_or_invalid');
    }
    if(!['image','video'].includes(candidate?.mediaKind)) findings.push('media_kind_invalid');
  }

  return findings;
}

export async function runAssignment({assignment}){
  const role=assignment?.role;
  const {request,candidate}=pair(assignment?.item);
  if(!ROLES.has(role)){
    return {
      schema:'evercraft.fallen.source-candidate-guard.v1',
      status:'blocked',
      role,
      candidate_id:candidate?.id||null,
      request_id:request?.id||null,
      findings:['unknown_source_guard_role']
    };
  }
  const findings=inspect(role,request,candidate);
  return {
    schema:'evercraft.fallen.source-candidate-guard.v1',
    status:findings.length?'rejected':'completed',
    agent_id:assignment?.agent_id||null,
    role,
    candidate_id:candidate?.id||null,
    request_id:request?.id||null,
    findings,
    boundaries:{
      no_download_implied:true,
      no_rights_inferred:true,
      no_subject_match_inferred:true,
      no_publication_authority:true
    }
  };
}

export async function reconcile({results,plan}){
  const rows=Array.isArray(results)?results:[];
  const required=Array.isArray(plan?.roles)?plan.roles:[...ROLES];
  const grouped=new Map();
  for(const row of rows){
    const key=row?.candidate_id||'unknown';
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(row);
  }
  const candidates=[];
  for(const [candidateId,entries] of grouped){
    const roles=new Set(entries.map(row=>row.role));
    const missing=required.filter(role=>!roles.has(role));
    const findings=[...new Set(entries.flatMap(row=>row.findings||[]))];
    candidates.push({
      candidate_id:candidateId,
      request_id:entries[0]?.request_id||null,
      status:missing.length||findings.length?'rejected':'admitted_for_source_conversion',
      missing_roles:missing,
      findings
    });
  }
  return {
    schema:'evercraft.fallen.source-acquisition-reconciliation.v1',
    status:candidates.every(row=>row.status==='admitted_for_source_conversion')?'reconciled':'rejected',
    candidates,
    execution_boundary:{
      discovery_or_download_performed:false,
      source_asset_conversion_is_next_gate:true,
      publication_authority:false
    }
  };
}
