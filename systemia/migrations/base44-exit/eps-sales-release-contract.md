# EPS Sales Command | Independent cutover contract

**October 14, 2026 | STATUS: RELEASE BLOCKED.** Recovered GitHub write access is not an app deployment.

## Purpose

Deliver a staff-only, mobile-first Evercraft Property Services sales workflow for Jeano and approved field representatives: customer/address intake, measured scope, private photos, deterministic pricing, save/reopen, manager review and customer-only preliminary quote documents. A **25% minimum modeled gross-margin floor** must be enforced at the server. A modeled floor does not prove the job's realized margin.

## Protect source and customers

The independent EPS Sales Command RC2 already exists as an offline ZIP and passed 4 local automated checks, including authentication, SQLite persistence, photo access separation, and a pricing example. It is **not live** and is **not enrolled in GitHub source control**. Its proprietary implementation belongs in a separately approved **private EPS repository**. Do not publish customer records, job photos, passwords, private keys, access tokens, source secrets or proprietary application code in the public Forge Operator repository.

## Canonical deployment path

Systemia admission → reviewed private EPS source → CI artifact → Yard Operator → Evercraft Compute authorized capacity → private persistent DB/photo storage, backups and TLS → external public route verification → real iPhone QA → deployment and rollback receipts → owner authorization.

GitHub supplies source and CI evidence. GitHub Pages cannot host the EPS private backend.

## Mandatory acceptance, all gates required

1. Run `node scripts/eps-sales-owned-route-gate.mjs https://owner-approved-eps-origin` from outside the hosting network. It must reject HTML holding pages with HTTP 200, missing app assets and public access to private endpoints. The only possible passing status is `PUBLIC_SMOKE_ONLY`, not delivered.
2. Authenticate owner and Jeano separately; verify sales users cannot read each other's customers or photos. Test logout, expired or revoked accounts and denied anonymous access.
3. On an actual iPhone: create a test lead, take a photo, save it, sign out, sign back in, reopen the same job and photo, generate a customer PDF. Confirm no internal worker rates, cost items or margin in the customer's document.
4. Prove backup AND restore for SQLite and private photo storage. Verify host TLS, monitoring, secret custody, rollback and safe image handling.
5. Reproduce the two concrete pads example from its *modeled* assumptions: 16×33 ft plus 15×16 ft (768 sq ft), $7,200 pre-tax, approximately 28.72% modeled margin, 25% redline. Supplier costs, site conditions and sales tax must still be confirmed.
6. Save independent QA receipts and obtain owner approval before exposing the URL to Jeano or customers.

## Current blockers

- No authenticated, reachable owned EPS production deployment with verified private persistence and HTTPS.
- No approved private GitHub EPS repository or authorized Yard release.
- No external-device end-to-end proof of authenticated photo upload, save/reopen, PDF, or restore.

**No Base44 dependency or user publishing action is part of this migration.**

## RC3 independent release candidate: 2026-10-15

RC3 is a private local ZIP handoff, **not** source code committed to this public repository and **not** a production release. Its exact ZIP SHA-256 is `d4aac5feb227668303c1f0f76d25a564dd3607daa3fc192cdf8a06ef3a90030a`.

Local test receipt: **6/6 Node.js tests pass**, including persisted job/photo recovery across process restart, restricted admin creation of sales logins, anti-CSRF header enforcement, confidential user boundaries, pricing floor, and local SQLite/photo backup-manifest integrity with corruption rejection. Public TLS host, physical iPhone login, actual form/printing via browser, managed encrypted/offsite backups, security approval, restore drill and delivery are **not verified**. Container browser navigation is blocked by policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), so there is no browser QA success receipt.

Release must remain **BLOCKED** until the owner approves a private EPS repo, Evercraft Compute capacity and an independent recipient phone acceptance test. The public Forge PR is a non-deploying policy/CI gate only.
