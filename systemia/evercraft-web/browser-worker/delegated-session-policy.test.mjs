import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDelegatedElementAllowed,
  assertDelegatedNavigationAllowed,
  delegationReceipt,
  normalizeDelegatedBrowserAction,
  normalizeDelegationPolicy,
} from "./delegated-session-policy.mjs";

test("competition browser delegation is same-origin and draft-only", () => {
  const policy = normalizeDelegationPolicy({}, {
    currentUrl: "https://qloo.devpost.com/projects/123",
    sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  assert.deepEqual(policy.allowed_origins, ["https://qloo.devpost.com"]);
  assert.equal(policy.accepts_new_terms, false);
  assert.equal(policy.final_submission_authority, false);
  assert.equal(policy.payment_authority, false);
  assert.equal(policy.secret_entry_authority, false);
  assert.ok(policy.scopes.includes("draft_form_fill"));
});

test("cross-origin delegation is rejected in v1", () => {
  assert.throws(() => normalizeDelegationPolicy({
    allowed_origins: ["https://qloo.devpost.com", "https://secure.devpost.com"],
  }, {
    currentUrl: "https://qloo.devpost.com/",
    sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }), /delegation_cross_origin_not_allowed_v1/);
});

test("sensitive legal, payment, and security controls are blocked", () => {
  const click = normalizeDelegatedBrowserAction({ type: "click", selector: "#action" });
  for (const text of [
    "Accept Official Rules",
    "Join Hackathon",
    "Submit Project",
    "Pay now",
    "Enable MFA",
    "I certify eligibility",
  ]) {
    assert.throws(() => assertDelegatedElementAllowed(click, {
      tag: "button",
      type: "button",
      text,
    }), /delegated_sensitive_control_blocked/);
  }
});

test("password, OTP, banking and CAPTCHA fields are blocked", () => {
  const fill = normalizeDelegatedBrowserAction({ type: "fill", selector: "input", value: "redacted" });
  const metas = [
    { tag: "input", type: "password", name: "password" },
    { tag: "input", type: "text", autocomplete: "one-time-code" },
    { tag: "input", type: "text", name: "routing_number" },
    { tag: "input", type: "text", name: "captcha_response" },
  ];
  for (const meta of metas) {
    assert.throws(() => assertDelegatedElementAllowed(fill, meta), /delegated_/);
  }
});

test("ordinary draft fields and Save Draft remain automatable", () => {
  const fill = normalizeDelegatedBrowserAction({ type: "fill", selector: "#description", value: "Working project description" });
  assert.equal(assertDelegatedElementAllowed(fill, {
    tag: "textarea",
    name: "project_description",
    placeholder: "Describe your project",
  }), true);

  const save = normalizeDelegatedBrowserAction({ type: "click", selector: "#save", intent: "draft_save" });
  assert.equal(assertDelegatedElementAllowed(save, {
    tag: "button",
    type: "submit",
    text: "Save Draft",
    name: "save_draft",
  }), true);
});

test("delegated navigation cannot leave the authenticated origin", () => {
  const policy = normalizeDelegationPolicy({}, {
    currentUrl: "https://qloo.devpost.com/projects/1",
    sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  assert.equal(assertDelegatedNavigationAllowed(
    normalizeDelegatedBrowserAction({ type: "navigate", url: "https://qloo.devpost.com/projects/2" }),
    policy,
    "https://qloo.devpost.com/projects/1"
  ), true);
  assert.throws(() => assertDelegatedNavigationAllowed(
    normalizeDelegatedBrowserAction({ type: "navigate", url: "https://example.com/" }),
    policy,
    "https://qloo.devpost.com/projects/1"
  ), /delegated_cross_origin_navigation_blocked/);
});

test("delegation receipt never implies legal or financial authority", () => {
  const policy = normalizeDelegationPolicy({}, {
    currentUrl: "https://qloo.devpost.com/",
    sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  const receipt = delegationReceipt({ sessionId: "session-1", policy });
  assert.equal(receipt.accepts_new_terms, false);
  assert.equal(receipt.final_submission_authority, false);
  assert.equal(receipt.secret_material_recorded, false);
});


test("generic delegated clicks are links only; buttons require verified draft-save intent", () => {
  const generic = normalizeDelegatedBrowserAction({ type: "click", selector: "#next", intent: "nonbinding" });
  assert.throws(() => assertDelegatedElementAllowed(generic, {
    tag: "button",
    type: "button",
    text: "Next",
  }), /delegated_nonbinding_click_requires_link/);

  assert.equal(assertDelegatedElementAllowed(generic, {
    tag: "a",
    href: "https://qloo.devpost.com/projects/123/edit",
    text: "Edit project",
  }), true);

  const disguised = normalizeDelegatedBrowserAction({ type: "click", selector: "#finish", intent: "draft_save" });
  assert.throws(() => assertDelegatedElementAllowed(disguised, {
    tag: "button",
    type: "button",
    text: "Continue",
  }), /delegated_draft_save_control_unverified/);
});
