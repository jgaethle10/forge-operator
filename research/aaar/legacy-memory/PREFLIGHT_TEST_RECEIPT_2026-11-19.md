# AAAR F-22 mDTC sourcing | reproducible preflight test receipt

**Execution:** 2026-11-19 local research session (America/Los_Angeles), Node.js v22.16.0, offline local copy of canonical GitHub files.  
**Canonical review:** [Draft PR #2309](https://github.com/jgaethle10/forge-operator/pull/2309); [AAAR mission #2285](https://github.com/jgaethle10/forge-operator/issues/2285); [supplier feasibility #2301](https://github.com/jgaethle10/forge-operator/issues/2301).

## Input integrity (Git blob identity)
Before the local tests, exact UTF-8 file content was independently reconstructed from the GitHub connector reads and checked with `git hash-object`:

| Input | Verified Git blob SHA |
|---|---|
| `supplier-preflight.mjs` | `b23e6d86c9729eb4d8503da20a66dfb5c585c455` |
| `supplier-preflight.test.mjs` | `76760b1f26bc551c097d54455c314d4d76213543` |
| `supplier-candidates-2026-11-19.json` | `6cf2c4da81cdf14fea76f0195c793ef7acd43fcc` |

These match the exact GitHub file blob SHAs as retrieved at the evidence cut. File hash identity verifies the code and ledger used; it is **not** independent supplier verification.

## Commands
```sh
node --check research/aaar/legacy-memory/supplier-preflight.mjs
node --check research/aaar/legacy-memory/supplier-preflight.test.mjs
node --test research/aaar/legacy-memory/supplier-preflight.test.mjs
node research/aaar/legacy-memory/supplier-preflight.mjs research/aaar/legacy-memory/supplier-candidates-2026-11-19.json > preflight-report.json
sha256sum preflight-report.json
```

Paths above are canonical repo paths; local test execution used the identical three files in an isolated working directory.

## Observed test outcome
**PASS: 5 tests, 0 failures.** All five checks passed:
1. Unknown ledger schema rejected.
2. Unknown supplier public listing held with 0/16 documents.
3. All 16 **synthetic** document pointers still do not authorize an F-22-related response.
4. Non-HTTPS file:/// URI does not count as a documentary evidence pointer.
5. Exact current four-supplier ledger has no qualified candidates.

## Observed report (exact real candidate statuses)
| Candidate | Documented evidence requirements | Preflight |
|---|---:|---|
| Fortasa | 0 / 16 | RESEARCH_HOLD |
| Delkin | 0 / 16 | RESEARCH_HOLD |
| PCcardsDirect | 0 / 16 | RESEARCH_HOLD |
| California PC FLASH | 0 / 16 | RESEARCH_HOLD |

All six company/notice readiness checks are false or unverified. Automated response permission **FALSE**.

Full local JSON report SHA-256: `edd1c380ab868faa75cb80ca5f692f3167ce5bab1b21e92cec3678eb1fb5644e`.

## Limitations / next acceptance gates
- The tests prove the ledger correctly stays **on hold**; they do **not** inspect or authenticate actual OEM documents, physical inventory, host compatibility, government qualification, or corporate registrations.
- The original SAM.gov attachment is linked as public but has **not** been independently read as a PDF against the external transcript; this remains a required evidence gate.
- Exact prices from public catalogs are **not written supplier quotes**, guaranteed stock, or margins.
- No correspondence with suppliers or government, spend, orders, manufacturing, certification, bidding, flight operations, or runtime deployment occurred.
- Evidence completeness can progress to **human review required** only; no version of this tool auto-submits or authorizes procurement.
- The Node test run was on local compute, not GitHub CI and not a live Systemia deployment.

**Next action:** source primary documentation, obtain qualified supplier relationship and verified corporate eligibility, review contract/export/counterfeit obligations. Do not submit unless independent reviewers and the founder approve a truthful capability response by the Air Force deadline.
