import fs from 'node:fs';
import { loadFinancialCapabilityMatrix, routeFinancialCapability } from './financial-capability-router.mjs';
import { resolveFinancialAuthority } from './financial-authority-registry.mjs';

export function loadFinancialProducts(path='systemia/payments/financial-products.json'){
  return JSON.parse(fs.readFileSync(path,'utf8'));
}
export function loadAuthorityRegistry(path='systemia/payments/financial-authority-registry.json'){
  return JSON.parse(fs.readFileSync(path,'utf8'));
}

export function routeFinancialProduct({
  productKey,
  products=loadFinancialProducts(),
  matrix=loadFinancialCapabilityMatrix(),
  authorityRegistry=loadAuthorityRegistry()
}={}){
  const product=(products.products||[]).find(x=>x.product_key===productKey);
  if(!product) throw new Error('unknown financial product');

  const routes=(product.capabilities||[]).map(capabilityKey=>{
    const cap=(matrix.capabilities||[]).find(x=>x.capability_key===capabilityKey);
    if(!cap) return {capability_key:capabilityKey,allowed:false,blockers:['unknown_capability']};

    if(!cap.regulated_authority_required){
      return routeFinancialCapability({capabilityKey,matrix});
    }

    const resolved=resolveFinancialAuthority({
      registry:authorityRegistry,
      authorityKey:product.authority_key,
      capabilityKey
    });

    return routeFinancialCapability({
      capabilityKey,
      matrix,
      regulatedAuthority:resolved.ok?resolved.authority.evidence_ref:null,
      depositInsuranceAuthority:resolved.ok?resolved.authority.insurance_authority_ref:null,
      regulatedAuthorityVerified:resolved.ok,
      depositInsuranceAuthorityVerified:resolved.ok && Boolean(resolved.authority.insurance_authority_ref)
    });
  });

  const ready=routes.every(x=>x.allowed);
  return {
    schema:'evercraft.financial.product-route.v1',
    product_key:product.product_key,
    product_name:product.name,
    declared_state:product.state,
    ready,
    execution_state:ready?'ready_within_declared_boundaries':'blocked_on_authority_or_capability',
    capabilities:routes,
    custody_claim:product.custody_claim===true,
    bank_claim:product.bank_claim===true,
    boundary:ready
      ? 'Ready means the declared capabilities can route within current authority boundaries; it does not expand legal authority.'
      : 'Blocked capabilities must not be represented as live customer financial services.'
  };
}
