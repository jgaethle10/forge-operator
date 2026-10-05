import test from "node:test";
import assert from "node:assert/strict";
import { applyAuthorizationLedger, resolveCompetitionAuthorization } from "./authorization-ledger.mjs";

test("provider authentication is inherited without inheriting competition terms", () => {
  const ledger = {
    providers: {
      devpost: {
        authenticated: true,
        identity_verified: true,
        mfa_satisfied: true,
        submission_executor: "browser_required",
      },
    },
    competitions: {
      "qloo-2026": {
        terms_state: "accepted",
        eligibility_attested: true,
      },
    },
  };

  const qloo = resolveCompetitionAuthorization({ provider: "Devpost", opportunity_id: "qloo-2026" }, ledger);
  assert.equal(qloo.provider_authenticated, true);
  assert.equal(qloo.terms_state, "accepted");

  const paypal = resolveCompetitionAuthorization({ provider: "Devpost", opportunity_id: "paypal-2026" }, ledger);
  assert.equal(paypal.provider_authenticated, true);
  assert.equal(paypal.terms_state, null);
  assert.equal(paypal.eligibility_attested, false);
});

test("inline authority may narrow or satisfy a specific opportunity without mutating ledger semantics", () => {
  const rows = applyAuthorizationLedger([{
    provider: "kaggle",
    opportunity_id: "gemma-2026",
    authorization: { terms_state: "entered" },
  }], {
    providers: { kaggle: { authenticated: true, submission_executor: "api" } },
  });

  assert.equal(rows[0].authorization.provider_authenticated, true);
  assert.equal(rows[0].authorization.submission_executor, "api");
  assert.equal(rows[0].authorization.terms_state, "entered");
});
