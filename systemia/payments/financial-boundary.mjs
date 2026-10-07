export const EVERCRAFT_FINANCIAL_STATES = Object.freeze({
  PAYMENTS:'payments',
  PARTNER_LED_FINANCIAL_SERVICES:'partner_led_financial_services',
  CHARTER_FEASIBILITY:'charter_feasibility',
  CHARTERED_DEPOSITORY:'chartered_depository'
});

export const REGULATED_CLAIMS = Object.freeze([
  'bank',
  'credit_union',
  'insured_deposit',
  'fdic_insured',
  'ncua_insured',
  'accept_deposits',
  'lend_as_principal',
  'direct_deposit_account'
]);

export function classifyFinancialCapability({
  state=EVERCRAFT_FINANCIAL_STATES.PAYMENTS,
  claims=[],
  charterAuthority=null,
  depositInsuranceAuthority=null
}={}) {
  const normalizedClaims=claims.map(x=>String(x).toLowerCase());
  const regulated=normalizedClaims.filter(x=>REGULATED_CLAIMS.includes(x));
  const errors=[];

  if (regulated.length>0 && state!==EVERCRAFT_FINANCIAL_STATES.CHARTERED_DEPOSITORY) {
    errors.push('regulated depository claims require chartered_depository state');
  }
  if (state===EVERCRAFT_FINANCIAL_STATES.CHARTERED_DEPOSITORY && !charterAuthority) {
    errors.push('charter authority required');
  }
  if (normalizedClaims.some(x=>['insured_deposit','fdic_insured','ncua_insured'].includes(x)) && !depositInsuranceAuthority) {
    errors.push('deposit/share insurance authority required');
  }

  return {
    ok:errors.length===0,
    state,
    regulated_claims:regulated,
    charter_authority:charterAuthority,
    deposit_insurance_authority:depositInsuranceAuthority,
    errors
  };
}

export function buildFinancialRoute({
  capability,
  requiresCharter=false,
  regulatedPartner=null
}={}) {
  if (!capability) throw new Error('capability required');

  if (requiresCharter) {
    return {
      schema:'evercraft.financial.route.v1',
      capability:String(capability),
      execution_state:'blocked_pending_charter_or_authorized_partner',
      evercraft_role:'orchestration_intelligence_and_experience',
      provider_role:'regulated_financial_authority',
      regulated_partner:regulatedPartner,
      direct_execution_allowed:false
    };
  }

  return {
    schema:'evercraft.financial.route.v1',
    capability:String(capability),
    execution_state:'evercraft_payments_allowed',
    evercraft_role:'canonical_economic_order_and_orchestration',
    provider_role:regulatedPartner ? 'regulated_partner_if_required' : null,
    regulated_partner:regulatedPartner,
    direct_execution_allowed:true
  };
}
