// Wheel Lab merchant evidence gate. Pure/local evaluation only:
// NEVER outreach, CRM mutation, pricing authority or Systemia mission admission.
const clean = (v) => String(v ?? '').trim();

export function evaluateMerchantPilot(records = []) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const distinct = new Set();
  const failures = [];
  let valid = 0;
  let optInCandidates = 0;
  let differentiatedWorkflows = 0;

  records.forEach((record, idx) => {
    const business = clean(record?.business_key).toLowerCase();
    if (!business || !/^[a-z0-9][a-z0-9-]{2,75}$/.test(business)) {
      failures.push({index: idx, reason: 'business_key_missing'});
      return;
    }
    if (distinct.has(business)) {
      failures.push({index: idx, reason: 'duplicate_business'});
      return;
    }
    const sourceRef = clean(record?.response_evidence_ref);
    const consent = record?.voluntary_response === true;
    const pain = clean(record?.current_workflow_pain);
    const alternative = clean(record?.existing_alternative);
    const date = clean(record?.observed_at);
    const timeValid = /^\d{4}-\d{2}-\d{2}T/.test(date) &&
      Number.isFinite(Date.parse(date));
    if (!consent || !sourceRef || !pain || !alternative || !timeValid) {
      failures.push({index: idx, reason: 'permissioned_response_evidence_incomplete'});
      return;
    }
    distinct.add(business);
    valid++;
    if (record?.unserved_workflow_confirmed === true) differentiatedWorkflows++;
    if (record?.explicit_pilot_interest === true &&
        clean(record?.pilot_interest_evidence_ref)) optInCandidates++;
  });

  let state = 'insufficient_permissioned_evidence';
  if (valid >= 3 && differentiatedWorkflows >= 1 && optInCandidates >= 1) {
    state = 'human_review_candidate';
  } else if (valid >= 3) {
    state = 'no_distinct_pilot_wedge_yet';
  }

  return {
    schema: 'evercraft.wheel-lab.merchant-evidence-review.v1',
    state,
    permissioned_distinct_responses: valid,
    evidence_incomplete_or_duplicate_count: failures.length,
    unserved_workflow_claims: differentiatedWorkflows,
    pilot_interest_claims: optInCandidates,
    failures,
    commercial_authority_granted: false,
    contact_authority_granted: false,
    launch_authority_granted: false,
    note: 'Claims are supplied by an operator and require independent human source verification. No outreach or sale is authorized.'
  };
}
