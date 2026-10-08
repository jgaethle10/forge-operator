export function verifyAuthorityRecord(record={},capabilityKey){
  const errors=[];
  if(record.status!=='verified') errors.push('authority status must be verified');
  if(!record.authority_key) errors.push('authority_key required');
  if(!record.regulator_or_issuer) errors.push('regulator_or_issuer required');
  if(!record.evidence_ref) errors.push('evidence_ref required');
  if(!Array.isArray(record.capability_scope) || !record.capability_scope.includes(capabilityKey)){
    errors.push('capability not in verified authority scope');
  }
  if(record.expires_at && Number.isNaN(Date.parse(record.expires_at))) errors.push('invalid expires_at');
  return {ok:errors.length===0,errors};
}

export function resolveFinancialAuthority({registry,authorityKey,capabilityKey}={}){
  if(!registry) throw new Error('authority registry required');
  if(!authorityKey) return {ok:false,reason:'no_authority_key',authority:null};
  const record=(registry.authorities||[]).find(x=>x.authority_key===authorityKey);
  if(!record) return {ok:false,reason:'authority_not_found',authority:null};
  const verified=verifyAuthorityRecord(record,capabilityKey);
  if(!verified.ok) return {ok:false,reason:'authority_not_verified_for_capability',errors:verified.errors,authority:null};
  return {
    ok:true,
    reason:'verified_authority',
    authority:{
      authority_key:record.authority_key,
      regulator_or_issuer:record.regulator_or_issuer,
      evidence_ref:record.evidence_ref,
      insurance_authority_ref:record.insurance_authority_ref||null,
      capability_scope:[...record.capability_scope]
    }
  };
}
