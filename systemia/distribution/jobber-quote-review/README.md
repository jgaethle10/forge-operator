# Jobber → Evercraft Contractor Intelligence: read-only quote pilot

**Actual state:** offline pure-function code + synthetic tests, NOT connected to Jobber, NOT approved/published, NOT a customer integration, NOT billable.

**Goal:** identify quotes old enough to justify an *operator review*, not claim lost revenue or send duplicate follow-ups. Jobber has its own follow-up features; a differentiated outcome must be established by a real evaluation.

## Implementation
- quote-review.mjs: tenant-scoped, opt-in explicit status list, complete-pagination requirement, dedupe on quote ID, conservative time logic, no contacts/names/amounts in output; no writes or network calls.
- quote-review.test.mjs: synthetic Node tests only.
- GraphQL example supplied in module. Verify query syntax, enum values, selected current API version and read-only scopes in Jobber GraphiQL before live use.
- Do not disclose client IDs/secrets, refresh tokens, PII, or production data in GitHub or chat.

## Gate sequence
1. Owner creates Jobber Draft app in developer.getjobber.com and *separate Jobber developer test account* per official guide.
2. Enable account 2FA; choose only required read-only quote scope. Capture confidential developer app ID and exact granted scopes without exposing secrets.
3. In GraphiQL run the read-only quote query against synthetic test records; validate pagination and enum values.
4. Implement external Evercraft-owned OAuth backend with state and PKCE as applicable, secure storage, refresh rotation, tenant separation, disconnect cleanup, rate limiting and privacy policy.
5. Complete signed-in and signed-out QA with tester, no automatic customer outreach. Confirm built-in Jobber follow-up behavior before differentiating this product.
6. Route through Systemia admission, architecture/security, evidence and release gates. No live customer data or distribution until consent and platform requirements met.
7. Only after approved product economics, verify checkout/payment/fulfillment; no assumed monetization.

**Official docs**
- https://developer.getjobber.com/docs/getting_started/
- https://developer.getjobber.com/docs/building_your_app/app_authorization/
- https://developer.getjobber.com/docs/publishing_your_app/app_review_process/
- https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/

**Test:** node --test systemia/distribution/jobber-quote-review/quote-review.test.mjs

**Open dependencies:** Jobber app/test-account IDs, GraphiQL and authorized OAuth access; operational readback; a genuinely differentiated benefit; Systemia formal admission; security and commercial gates. Jobber Draft apps are subject to connection limits. Do not advertise an unapproved association.
