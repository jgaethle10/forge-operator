# Evercraft Tax Headquarters: EPS 2026 reconstruction

Status: **Investigation / evidence required**. This is an internal engineering and bookkeeping playbook, **not** a tax return or an assertion that tax has been paid. Do not commit tax IDs, bank exports, wage records, invoices, client details, login credentials, or other sensitive data to this repository.

## Entity hierarchy
- Legal entity: Evercraft LLC. EPS / Evercraft Property Services is a DBA / operating segment, not automatically a separate income-tax taxpayer.
- Verify the **legal ownership and federal tax classification for each effective period**, including any partnership interval, late or retroactive ownership correction, EIN changes, or Forms 8832/2553. Do not assume current sole ownership describes all of 2026.
- Keep segment accounting for EPS, Havenly, studio and other Evercraft lines *inside* the appropriate legal-entity ledger. Make an explicit allocation only with supporting receipts/invoices.
- Distinguish bank account holder names from actual tax entity, source of funds, and business segment.

## Evidence ladder
1. **Verified**: state filings, state tax-account records, signed entity agreements/amendments, IRS correspondence/transcripts, bank statements, payroll provider filings, filed return confirmations, client invoices and supporting receipts.
2. **Reported / needs corroboration**: founder recollections, historical messages, spreadsheets without provenance, summaries or previous financial snapshots.
3. **Unknown**: no source available. The software should present a missing-evidence task, not infer that the balance is zero or the return was filed.

Statuses are separate: `source-collected`, `reconciled`, `reviewed`, `filed-confirmed`, and `paid-confirmed`. Filing and payment require *different* confirmations. A filed return does not prove its assessment was paid.

## Investigation order
| Priority | Workstream | Evidence to obtain | Completion gate |
|---|---|---|---|
| P0 | IRS/WA notices and immediate deadlines | Dated notices, accounts, response deadlines | Every notice has an owner, due date, source reference |
| P0 | Employment / withholding | W-2/W-3, 941/940, payroll journals, ESD reports, L&I, WA PFML and WA Cares when applicable | Compare wages and reported/paid balances for every period |
| P1 | Company & taxpayer history | WA Secretary of State amendments, formation, operating agreements, EIN letter, elections, ownership agreements | Effective-dated entity / tax-classification timeline |
| P1 | WA DOR / city filings | My DOR history, filing frequency, registrations, B&O/sales tax, city endorsements | Every required period: required / filed / paid, each evidenced |
| P1 | Financial reconstruction | Statements, Stripe payouts and fees, cash, checks, invoicing, contractor docs, owner contributions | Each transaction sourced and classified, reconciled to balances |
| P2 | Income tax / estimated payments | Prior filings, IRS account records, 1099s, business P&L, asset schedule | Draft only from reconciled book + verified classification |
| P2 | Operational cadence | Intake controls, monthly close and report exports | Repeatable checks with no unsupported completion claims |

## 2026 bank reconciliation design
- Import source statements through a private, authenticated service only. Tag every row: institution + account + immutable transaction ID + source date + import batch + evidence locator.
- First retrieve **all posted credits** across relevant accounts and check pending credits separately. Never treat all deposits as revenue.
- Classify each: customer sale (EPS / other Evercraft segment), taxable/non-taxable activity as appropriate, owner contribution, owner loan, outside financing, personal reimbursement, refund, internal transfer, unknown.
- Match duplicate bank transfers by linkage/IDs and verified counterpart, **never just equal dollar amounts**.
- Match Stripe gross receipts, fees, payouts and refunds to underlying orders. Payout is not a second sale. Fees may be expenses only if supported.
- Reconcile ordinary purchases, owner withdrawals, payroll, sales tax collected, remittances, refunds, and card payments separately. Bank merchant categories are **not** tax classifications.
- Keep personal and business activity separated while preserving an audit trail. Do not delete or hide disputed transactions.
- Track account coverage and last-updated evidence independently; unknown freshness cannot establish completeness.
- Store money as integer cents; avoid floating point comparisons for final financial calculations.

## Special questions that cannot be assumed
- Which EPS activities were taxable retail sales or subject to retail sales tax vs service B&O? Source: actual service description / invoices and WA DOR classification, not generic labels.
- When did each ownership change legally take effect, and what was the federal taxpayer classification then?
- Were workers employees or contractors, and which quarters had actual wages, withheld amounts, paid taxes, and filed reports?
- What portion of deposits belongs to EPS, the broader Evercraft LLC, another venture, or personal funding?
- Was a tax return filed? Was payment made? Record two separately verified events.

## Source-of-truth policy
- **GitHub:** application code, schemas, tests, non-sensitive checklists only.
- **Systemia private store:** encrypted transaction evidence, audit logs, access controls, attachments; never exposed through a public route.
- **Tax authority portals:** authoritative receipt and account status (manual owner review where sign-in is required).
- **Tax professional review:** amendments, entity election consequences, and payroll corrections before submission.

## Current development gates
- [x] Draft standalone workflow UI in `public/apps/tax-headquarters/index.html`.
- [x] Build a non-sensitive reconstruction / evidence plan.
- [ ] Authenticated, access-restricted data storage and audit log.
- [ ] Import / reconcile source statements with de-duplication tests.
- [ ] Safe role permissions; redact PII; prohibit public tax attachment hosting.
- [ ] Confirm entity history and scope of tax years affected.
- [ ] Verify tax authority filing history and exact deadlines.
- [ ] Real records reconciled, documented and reviewed.
- [ ] Submission/payment integrations only with explicit authorization and verified receipts.

**No tax forms submitted, taxes paid, or liability totals certified by this build.**
