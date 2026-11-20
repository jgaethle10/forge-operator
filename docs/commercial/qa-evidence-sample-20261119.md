# Evercraft QA evidence sample: checkout disclosure and release parity

**Scope:** publicly shareable, evidence-linked example from Evercraft's own Website Audit product.  
**Case date:** 2026-11-19. **Status:** historical source fix verified; public deployment parity and paid fulfillment **not** independently verified.  
**Owner:** Evercraft LLC. **Work type:** release QA, exact-copy regression, source-to-live comparison and commerce truthfulness.  
**Not a client testimonial, third-party audit, pentest, production sign-off, or proof of an automated revenue/fulfillment pipeline.**

## The user outcome we protected

A buyer considering the one-time $49 Quick Win Website Audit needs to understand the price **before** sales tax, the hosted payment step, and when the reviewed report will arrive. Our working principle is simple: a correct implementation in GitHub does **not** automatically mean the customer is seeing it live.

## Source-backed observations

| ID | Evidence / observed behavior | Risk | Result at time of evidence |
| --- | --- | --- | --- |
| QA-01 | Canonical buyer-page source described the $49 item as **"including applicable sales tax"**, while the live Evercraft LLC Stripe link had a $49 base amount and automatic tax enabled. | The total at checkout could exceed the site's claimed tax-inclusive amount; misleading price disclosure. | **Source correction merged.** PR [#2278](https://github.com/jgaethle10/forge-operator/pull/2278) replaced it with "One-time $49 before any applicable sales tax, calculated at secure checkout." Do not assume the live site received the change. |
| QA-02 | Nov 19 live Website Audit canary run **[44577181711](https://github.com/jgaethle10/forge-operator/actions/runs/44577181711)** failed its `payments_authority` check: canonical source expected the "Evercraft Payments" authority label but the live page did not show it. | A passing source test can coexist with an outdated live page. Source-only review could mislead sales and buyers about deployed behavior. | **Historical live gate: FAIL**. PR #2278 explicitly did *not* fix deployment parity. Next required step: authorized owned deployment and rerun exact-origin canary. Current status unverified. |
| QA-03 | The hosted checkout and postpayment fulfillment are separate steps. PR #2278 includes explicit copy that work begins only after verified payment and ends with a human-reviewed report by email. | An active payment link alone can be mistaken for an automatically fulfilled service. | **Delivery and settlement end to end: NOT PROVEN** by this example. Do not promise automated fulfillment. |

## Reproducible test cases

### TC-01: Price and tax disclosure
- **Given:** approved current page source and exact active Stripe product configuration
- **When:** compare the buyer-facing displayed price, tax wording and checkout's base amount/automatic-tax setting
- **Expect:** price described as "$49 before applicable tax"; no "tax included" claim unless supported by checkout configuration
- **Evidence:** PR #2278 source diff and test updated to assert `before any applicable sales tax`
- **Status:** PASS in merged *source* correction, not proof of production deployment

### TC-02: Source-versus-live release parity
- **Given:** the exact public production origin and its current deployed HTML
- **When:** rerun the repository's Website Audit live canary, including `payments_authority`
- **Expect:** source-required authority/checkout statement appears on the public page; every release-gate requirement passes
- **Evidence:** original live canary run #44577181711 and PR #2278's caveat
- **Status:** FAIL in archived November 19 run; **await fresh run before any current PASS assertion**

### TC-03: Checkout and delivery claims
- **Given:** the product detail, hosted payment link and order handoff procedure
- **When:** read the page's exact copy and independently inspect the authorized payment-to-fulfillment flow
- **Expect:** no auto-delivery promise before a verified paid-order receipt and real report delivery mechanism is demonstrated
- **Evidence:** source copy in PR #2278 specifies a human-reviewed report after payment
- **Status:** buyer copy is source-reviewed; live completed order/report not demonstrated. **Do not mark E2E PASS**

## Example issue handoff

**Title:** Website Audit public buyer page is behind canonical payment-authority source  
**Severity:** High release-blocker for any *claim of source/live parity*, not evidence of failed card processing  
**Observed (November 19 canary):** `payments_authority` failed because live page lacked the expected authority label; other checks can pass while this one fails  
**Expected:** exact production origin displays the released payment-authority text and passes the gate  
**Steps to reproduce:** retrieve canary run #44577181711, identify its exact tested origin/check assertions, deploy owned source through the authorized release process, rerun the same canary on the same origin, attach the new timestamped run receipt  
**Acceptance:** record the current live result separately from source tests; no E2E fulfillment status without a distinct paid-order-to-report receipt

## What an outside buyer can evaluate from this sample

1. Can the tester distinguish **misleading text**, **live deployment drift**, and **actual payment/fulfillment** rather than collapsing everything into "checkout works"?
2. Are each finding's expected and actual outcomes, exact evidence references and reproduction boundaries explicit?
3. Does the tester flag what remains unverified instead of inventing a PASS?

**Source links:** [merged PR #2278](https://github.com/jgaethle10/forge-operator/pull/2278), [historical live run #44577181711](https://github.com/jgaethle10/forge-operator/actions/runs/44577181711). This document does not grant access, claim certification, represent another client's data, or authorize security testing.

*Evercraft LLC | Example from an internally owned product. For a client project, all scope, access, payment, acceptance criteria and privacy terms are agreed in writing before work.*
