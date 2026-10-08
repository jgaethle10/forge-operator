import fs from 'node:fs';

export function loadFinancialCapabilityMatrix(path='systemia/payments/financial-capabilities.json'){
  return JSON.parse(fs.readFileSync(path,'utf8'));
}

export function routeFinancialCapability({
  capabilityKey,
  matrix,
  regulatedAuthority=null,
  depositInsuranceAuthority=null,
  regulatedAuthorityVerified=false,
  depositInsuranceAuthorityVerified=false
}={}){
  if(!matrix) throw new Error('matrix required');
  const cap=(matrix.capabilities||[]).find(x=>x.capability_key===capabilityKey);
  if(!cap) throw new Error('unknown financial capability');

  const blockers=[];
  if(cap.regulated_authority_required && (!regulatedAuthority || regulatedAuthorityVerified!==true)) blockers.push('regulated_authority_required');
  if(cap.deposit_insurance_authority_required && (!depositInsuranceAuthority || depositInsuranceAuthorityVerified!==true)) blockers.push('deposit_insurance_authority_required');

  const allowed=blockers.length===0;
  return {
    schema:'evercraft.financial.capability-route.v1',
    capability_key:cap.capability_key,
    allowed,
    evercraft_role:cap.evercraft_role,
    route:allowed?cap.default_route:'blocked_until_verified_authority',
    regulated_authority:allowed?regulatedAuthority:null,
    regulated_authority_verified:allowed && Boolean(regulatedAuthority),
    deposit_insurance_authority:allowed?depositInsuranceAuthority:null,
    deposit_insurance_authority_verified:allowed && Boolean(depositInsuranceAuthority),
    claims_allowed:allowed?[...(cap.claims_allowed||[])]:[],
    blockers,
    boundary:cap.boundary||null
  };
}
