# Client 001 | CX-001 Release Assessment

**Business:** On The Go Mobile Quick Lube (Juan Bello)  
**Review URL:** https://jgaethle10.github.io/forge-operator/clients/on-the-go/review/  
**Source baseline:** V4.1, PR #2237 (2026-11-17). **Independent live browser QA:** PR #2257, [successful run 44450582567](https://github.com/jgaethle10/forge-operator/actions/runs/44450582567) (2026-11-18).  
**Standard:** [CX-001](../design/CUSTOMER-EXPERIENCE-RELEASE-STANDARD.md)  
**Classification:** OWNER-REVIEW PREVIEW. **NOT CLEARED FOR CUSTOMER PROMOTION.**

This is a living evidence ledger, **not** a customer financial record. Do not copy Juan's private messages or customer PII into the public repository.

## Known technical facts

- Corrected desktop header and hero link to `#contact`, not direct `tel:`.
- Contact block places a customer-authored `mailto:` inquiry first; exposes the published business email in text with a copy fallback. `tel:+15098335025` remains available.
- Customer controls use "Request service", "Call On The Go", equivalent Spanish business language. Internal referral panel is not on the page.
- V4 eight-package catalog, six two-tap guided combinations and bilingual inquiry survive V4.1.
- Existing Client 001 GitHub source tests and exact public HTTPS check passed at PR #2237 / verification workflow run 44217721776.
- V4 (before V4.1 desktop contact change) had older screenshots. **V4.1 now has its own independent Chromium acceptance evidence:** 12 successful EN/ES browser journeys at 375, 390, 768, 1024, 1280 and 1440 CSS px, with 12 full-page screenshots and an `acceptance.json` machine-readable receipt attached to run 44450582567. All four page images loaded after normal scrolling, with no horizontal overflow or script errors.
- Customer-facing pricing and service facts originate from the existing On The Go published services page; Juan's approval for final customer promotion is still required.

## Acceptance gate register

| CX-001 gate | Status | Evidence or missing proof |
| --- | --- | --- |
| A Brand/source | PARTIAL | Genuine approved commercial media, established palette; final exact logo mark and owner signoff not independently evidenced |
| B Desktop task | PASS (browser technical) | At 1280/1440 in EN/ES, service → selected-package email draft, visible address/copy fallback and nondialer desktop CTA tested; no email sent |
| C Phone task | PARTIAL | 375/390 EN/ES browser service → inquiry, tel option and noncall alternate passed, with screenshots and zero horizontal overflow. Final manual sticky-control overlap/real-device check still due |
| D Tablet/narrow | PASS (browser technical) | 768/1024 EN/ES Chromium walkthroughs and screenshots, service selection, contact route and overflow check passed |
| E Bilingual | PARTIAL | Live EN/ES browser journeys and selected-language email drafts now pass at all six widths; native-speaker final review still missing |
| F Keyboard/a11y | PARTIAL | Initial 1440px keyboard nav to language controls and desktop CTA passed; full contrast, screenreader and keyboard-only end-to-end review still needed |
| G Unhappy paths | PARTIAL | Denied clipboard in EN/ES passed with readable email fallback. No local mail-handler, refresh, zero-selection and real-device failure checks remain |
| H Source/CI | PASS | Existing source/CX-001 negative regression contracts passed in [run 44450582567](https://github.com/jgaethle10/forge-operator/actions/runs/44450582567) |
| I Exact live HTTPS | PASS (V4.1) | V4.1 HTTP 200 and correct title verified by real Chromium in [run 44450582567](https://github.com/jgaethle10/forge-operator/actions/runs/44450582567); no actual booking, email sending or payment proven |
| J Client/promotional approval | **BLOCKED** | Juan liked design usability but did not explicitly approve pricing, full content or customer-facing distribution |

## Remaining launch acceptance after the November 18 browser proof

1. Manually review the twelve rendered screenshots in [run 44450582567](https://github.com/jgaethle10/forge-operator/actions/runs/44450582567) for contrast, clipping, sticky controls and visual defects; independent real-device sampling is still valuable.
2. Complete deeper keyboard-only/screenreader and no-email-handler/refresh/no-selection unhappy-path checks. The automated suite covered the initial keyboard route and denied clipboard fallback, but not every edge case.
3. Confirm the exact current business claims, business logo/asset rights, prices, service area and contact routes with Juan. The source figures are published starting prices, not customer-approved final quotes.
4. Obtain Juan's **explicit customer-facing approval** of identity, content, claims and publication. Design praise or the live preview URL is not sufficient. An email approval-request draft exists in Gmail but was not sent.
5. After owner approval and any corrections, separately authorize promotion and verify the final customer-facing URL again; do not silently mutate Juan's existing website.

## Decision

**Independent technical browser gate: PASS (12/12); customer/publication gate: HOLD.** Corrected screenshot capture confirms lazy media loads after normal scrolling. Current customer promotion state = **HOLD pending remaining human experience review and Juan's explicit client authorization.** All paid/referral outcomes = **UNKNOWN** (not zero). No site mutation to Juan's existing website.

Related: [Client 001 Growth Evidence Log](./CLIENT001-ON-THE-GO-MANUAL-EVIDENCE-LOG.md).
