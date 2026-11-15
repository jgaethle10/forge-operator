// Bank policy for Evercraft's current candidate receiving institutions.
// This is NOT a bank connection or a bank-verified account status.
// Inputs must come from owner-approved, server-side Raven Nexus evidence.
export const BANK_OPTIONS = Object.freeze({
  bluevine: Object.freeze({
    role:'preferred_business_settlement',
    business_account_class:'business_checking',
    ach_credit_supported_by_provider_docs:true,
    zelle_business_supported:false
  }),
  hapo: Object.freeze({
    role:'secondary_business_settlement',
    business_account_class:'commercial_checking',
    ach_credit_supported_by_provider_docs:true,
    zelle_business_supported:'not_verified'
  }),
  sofi: Object.freeze({
    role:'personal_only_not_business_settlement',
    business_account_class:null,
    ach_credit_supported_by_provider_docs:false,
    zelle_business_supported:false
  })
});

export function verifyBankDestination(method, state = {}) {
  const bank = BANK_OPTIONS[state.institution];
  if (!bank || !bank.business_account_class) return false;
  if (state.account_class !== bank.business_account_class) return false;
  if (state.business_owner_verified !== true || state.receiving_account_verified !== true) return false;
  if (method === 'ach_credit') {
    return bank.ach_credit_supported_by_provider_docs === true &&
      state.bank_ach_receiving_confirmed === true;
  }
  if (method === 'zelle') {
    // Bluevine has expressly stated it does not integrate with Zelle.
    // HAPO has not been independently confirmed; don't infer from credit-union membership.
    return bank.zelle_business_supported !== false &&
      state.business_zelle_enrollment_confirmed === true &&
      state.bank_zelle_service_verified === true;
  }
  return false;
}
