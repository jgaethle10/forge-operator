# Systemia Relationship Command | Commercial product build

**Status: development preview, not publicly purchasable.**
**Owner: Evercraft LLC.** This builds on the existing Evercraft company-wide CRM and
Passport / Interaction Ledger. The private CRM is still not installed as a live
customer product. Never claim a signed customer, deployed tenant, working
checkout, subscription revenue, or activated public demo without verification.

## Product distinction

**A CRM that remembers what was promised, why an action is due, and when not to
contact someone.** Conventional address-book/pipeline tools are not the key
differentiator. The sellable wedge is the relationship memory plus evidence,
review queue, purpose-specific contact holds, and a trustworthy audit trail.

Initial customers: small service firms, creative agencies, community-oriented
organizations and owner-operated businesses with slow-moving relationships,
multiple staff, informal commitments, and missed handoffs.

## Present customer-facing artifacts

- Product introduction: \`public/products/systemia-relationship-command/index.html\`.
- Interactive demonstration:
  \`public/demos/systemia-relationship-command/index.html\`.
- Demo intentionally contains **five synthetic relationship records** only;
  search, filter, timeline, review queue, purpose-check simulation and temporary
  session notes are interactive. All client-entered notes are held only in
  browser memory and are not uploaded or persisted; no email send, payment,
  customer account or background browser network request exists.
- Server-side private read models:
  \`customer-workspace.mjs\` checks an authenticated, explicitly scoped actor
  and rejects wrong tenant, wrong division and unverified access.
  \`customer-vault.mjs\` reads a private tenant-file boundary using
  non-name-based SHA-256 paths and rejects unsafe file types and permissions.
  Both are read-only modules, not public API endpoints or identity providers.
  `customer-api.mjs` now supplies an **attachable, read-only** handler at
  `/v1/relationship-command/workspace`; an embedding backend must provide a
  trusted authenticated session callback and private vault. The handler
  rejects write verbs and client-supplied tenant query overrides, emits
  no-store/private anti-cache headers and redacts failures. It does **not**
  start a listener, implement login, or expose customer data by itself.
- Existing company CRM, relationship policy, signed approval read model,
  Passport/Interaction Ledger and governed mail adapter remain **draft**.
- Machine-readable launch hold: \`commercial-offer.json\`. Its billing gates
  are deliberately false.

## Proposed founding-customer package, NOT a live offer

**$1,500 proposed setup + $249/month proposed service.**
This is a **pricing hypothesis** that requires owner approval, labor/economics
review, contract, verified payment plumbing and a real deployment.
The proposed managed pilot includes exactly one scoped business workspace,
permissioned evidence intake, relationship timeline, open commitments,
follow-up review, contact holds and a documented outcomes review.
Scope changes, integrations and volume are quoted separately.

Do not enable public checkout, self-service sign-up, unverified lead intake, or
automated outreach from these static pages. Do not pre-sell unfulfillable
features or manufacture customer references.

## Production admission, ordered

1. Establish authoritative tenant identity and session enforcement. A
   customer-controlled browser must never supply its own owner/operator role.
2. Provision isolated private customer storage per tenant, including encrypted
   backup/restore, retention/deletion requests, source evidence, access logs,
   and reversible migration. Prove tenant isolation on real deployed machines.
3. Import only permissioned customer records with source references and human
   review; distinguish observed facts from interpretations. Customer email,
   conversations and sensitive notes must not appear in GitHub or public
   heartbeat artifacts.
4. Run the review queue against the tenant's authenticated API on owned
   HTTPS hosting. The static synthetic preview must never be confused with
   this production app.
5. Wire every discretionary outbound delivery path to signed approvals,
   current Passport grants, correct recipient resolution, purpose policies,
   idempotent dispatch, provider evidence, and operator reconciliation for
   unknown outcomes. Account-verification messages need their separate scope.
6. Bind real Payments/Stripe provider verification, invoice and entitlement
   checks. A displayed pricing proposal or checkout-open event is not a paid
   order; production access waits for independently verified settlement/
   entitlement policy.
7. Verify exact customer domain, TLS, external probes, incident recovery,
   sustainable infrastructure and operator support. No fabricated SLA.
8. Owner approves agreement and founding customer intake before activation.

## Acceptance proofs

- Run: \`node --test systemia/crm/customer-workspace.test.mjs systemia/crm/customer-vault.test.mjs systemia/crm/customer-api.test.mjs systemia/crm/product-surface.test.mjs\`.
- Confirm a viewer cannot inspect operator-only context, a different tenant
  never appears in another tenant's read model, and a no-contact event in a
  different division prevents independent preflight of the same subject.
- Confirm the preview executes from a local static file without an API and all
  fictional content is unmistakably labeled.
- Confirm \`commercial-offer.json\` billing and provisioning switches remain
  disabled until real independently verified deployment and payment proofs exist.
- Confirm the existing CRM/KAIDANCE and outbound preflight suites pass at PR
  head. A queued or unrelated failed CI job is not a verified green release.

**Next engineering target:** a real tenant identity/session broker, an
authorized operator API over the private read model, provisioning/retention
controls, and on-host production acceptance. None of these are simulated by
the product preview.
