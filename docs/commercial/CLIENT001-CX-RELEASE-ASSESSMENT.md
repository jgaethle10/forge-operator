# Client 001 | CX-001 Release Assessment

**Business:** On The Go Mobile Quick Lube (Juan Bello)  
**Review URL:** https://jgaethle10.github.io/forge-operator/clients/on-the-go/review/  
**Source baseline:** V4.1, PR #2237 (2026-11-17)  
**Standard:** [CX-001](../design/CUSTOMER-EXPERIENCE-RELEASE-STANDARD.md)  
**Classification:** OWNER-REVIEW PREVIEW. **NOT CLEARED FOR CUSTOMER PROMOTION.**

This is a living evidence ledger, **not** a customer financial record. Do not copy Juan's private messages or customer PII into the public repository.

## Known technical facts

- Corrected desktop header and hero link to `#contact`, not direct `tel:`.
- Contact block places a customer-authored `mailto:` inquiry first; exposes the published business email in text with a copy fallback. `tel:+15098335025` remains available.
- Customer controls use "Request service", "Call On The Go", equivalent Spanish business language. Internal referral panel is not on the page.
- V4 eight-package catalog, six two-tap guided combinations and bilingual inquiry survive V4.1.
- Existing Client 001 GitHub source tests and exact public HTTPS check passed at PR #2237 / verification workflow run 44217721776.
- V4 (before V4.1 desktop contact change) had mobile/desktop screenshot and interaction checks. **Those older screenshots do not prove V4.1's new actions.**
- Customer-facing pricing and service facts originate from the existing On The Go published services page; Juan's approval for final customer promotion is still required.

## Acceptance gate register

| CX-001 gate | Status | Evidence or missing proof |
| --- | --- | --- |
| A Brand/source | PARTIAL | Genuine approved commercial media, established palette; final exact logo mark and owner signoff not independently evidenced |
| B Desktop task | **BLOCKED** | V4.1 static and live HTML verified, but no new rendered 1280/1440 browser walkthrough showing service → email fallback with mail client absent |
| C Phone task | **BLOCKED** | Need 375/390 screenshot and click-through after V4.1 change, sticky control clearance |
| D Tablet/narrow | **BLOCKED** | Need 768 and 1024 screenshots and interactions |
| E Bilingual | PARTIAL | Source-level Spanish/English package + inquiry tests pass; end-to-end browser test and native-speaker final review missing |
| F Keyboard/a11y | **BLOCKED** | Visible focus semantics exist in source; tab traversal and contrast/screenreader review not re-run |
| G Unhappy paths | **BLOCKED** | Copy-to-clipboard failure message coded; need actual no-email-handler, denied clipboard, refresh and zero-selection browser tests |
| H Source/CI | PASS | Client 001 source checks and CX-001 negative regressions (attach exact passing CI run) |
| I Exact live HTTPS | PASS (V4.1) | Run 44217721776; do not infer a working mail client or real booking |
| J Client/promotional approval | **BLOCKED** | Juan liked design usability but did not explicitly approve pricing, full content or customer-facing distribution |

## Mandatory next acceptance run

1. Open **exact** deployed URL in independent browser sessions at **375, 390, 768, 1024, 1280, 1440 px**; save screenshot for each. Confirm no clipping, horizontal overflow, overlay or hidden CTA.
2. For each breakpoint, run **EN and ES**. Select an oil type, change tire-rotation setting, verify starting price, select the package, scroll to contact, inspect the prewritten email, and confirm no unauthorized transmission.
3. On desktop with no mail client, check the **displayed email address and copy button** (granted and denied clipboard). Confirm default CTA does not open phone dialer.
4. On phone, check the `tel:` link and sticky CTA without placing a real call. Verify the email alternate.
5. Test keyboard-only path, translated action labels, missing selection, invalid input, refresh, no fake booking confirmation.
6. Compare exact current business claims and all prices with Juan's current authorized source; invite Juan to correct any outdated details, but do not send him a spreadsheet.
7. After evidence is captured and issues repaired, ask for **explicit approval to use the site for customers**. Do not infer it from a compliment or a link review.

## Decision

**Source pass and HTTPS proof are NOT release approval.** Current customer promotion state = **HOLD pending rendered acceptance and client authorization.** All paid/referral outcomes = **UNKNOWN** (not zero). No site mutation to Juan's existing website.

Related: [Client 001 Growth Evidence Log](./CLIENT001-ON-THE-GO-MANUAL-EVIDENCE-LOG.md).
