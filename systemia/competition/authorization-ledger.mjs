function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function providerKey(value) {
  return lower(value).replace(/[^a-z0-9_-]+/g, "-");
}

function competitionKey(opportunity) {
  return String(opportunity?.opportunity_id || opportunity?.competition_ref || "").trim();
}

export function resolveCompetitionAuthorization(opportunity, ledger = {}) {
  const provider = providerKey(opportunity?.provider);
  const competition = competitionKey(opportunity);
  const providerRecord = ledger?.providers?.[provider] || {};
  const competitionRecord = ledger?.competitions?.[competition] || {};
  const inline = opportunity?.authorization || {};

  return {
    provider_authenticated: inline.provider_authenticated ?? providerRecord.authenticated ?? false,
    identity_verified: inline.identity_verified ?? providerRecord.identity_verified ?? false,
    mfa_satisfied: inline.mfa_satisfied ?? providerRecord.mfa_satisfied ?? false,
    captcha_satisfied: inline.captcha_satisfied ?? false,
    submission_executor: inline.submission_executor ?? providerRecord.submission_executor ?? null,

    // Legal/financial authority is deliberately competition-scoped. Provider-level
    // authentication must never silently become blanket acceptance of new rules.
    terms_state: inline.terms_state ?? competitionRecord.terms_state ?? null,
    eligibility_attested: inline.eligibility_attested ?? competitionRecord.eligibility_attested ?? false,
    payment_authorized: inline.payment_authorized ?? competitionRecord.payment_authorized ?? false,
    staking_authorized: inline.staking_authorized ?? competitionRecord.staking_authorized ?? false,

    authority_sources: {
      provider: Object.keys(providerRecord).length > 0 ? "authorization_ledger" : "inline_or_missing",
      competition: Object.keys(competitionRecord).length > 0 ? "authorization_ledger" : "inline_or_missing",
    },
  };
}

export function applyAuthorizationLedger(opportunities = [], ledger = {}) {
  return opportunities.map((opportunity) => ({
    ...opportunity,
    authorization: resolveCompetitionAuthorization(opportunity, ledger),
  }));
}

export function summarizeAuthorizationLedger(ledger = {}) {
  const providers = Object.entries(ledger?.providers || {}).map(([provider, record]) => ({
    provider,
    authenticated: record?.authenticated === true,
    identity_verified: record?.identity_verified === true,
    mfa_satisfied: record?.mfa_satisfied === true,
    submission_executor: record?.submission_executor || null,
  }));
  const competitions = Object.entries(ledger?.competitions || {}).map(([opportunity_id, record]) => ({
    opportunity_id,
    terms_state: record?.terms_state || null,
    eligibility_attested: record?.eligibility_attested === true,
    payment_authorized: record?.payment_authorized === true,
    staking_authorized: record?.staking_authorized === true,
  }));
  return {
    schema: "evercraft.systemia.competition-authorization-ledger-summary.v1",
    provider_count: providers.length,
    competition_count: competitions.length,
    providers,
    competitions,
    secret_values_included: false,
  };
}
