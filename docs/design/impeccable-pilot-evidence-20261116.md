# Evercraft | Pinned Impeccable Detector Pilot: evidence and learning

**Evidence date:** 2026-11-16 UTC. **Status:** isolated read-only source scan completed; no production adapter or browser-pixel acceptance.
**Workflow evidence:** https://github.com/jgaethle10/forge-operator/actions/runs/43828220758
**Upstream source:** https://github.com/pbakaus/impeccable
**Upstream pinned source commit:** d41d9860b0094dcb68030657da63461212835aaa
**Upstream license:** Apache-2.0; no copied source or assets
**Engine artifact:** release engine-v0.1.25 linux-x64, SHA-256 f48aca43294a9ba1ea3eb7b1d0a0b2d595c480e8c65003e410247b9884820ddd

## Test containment

A GitHub Actions worker downloaded the pinned binary and verified its exact digest before running the engine in a temporary Ubuntu container. The detector had no network, root privileges, secrets, customer data, checked-out repository, or writable source mounts. Runner access was limited to public source copies and an explicitly synthetic test fixture. CI=1, DO_NOT_TRACK=1, and IMPECCABLE_NO_TELEMETRY=1 were set. The binary was not installed in an Evercraft product, NodeSeed, or user machine.

## Reproducible static findings

| Input | Evercraft Human Experience static findings | Impeccable static findings |
| --- | ---: | ---: |
| Evercraft Headquarters index.html | 0 | 1 |
| Headquarters tower.css | Not covered by an independent baseline CSS scanner | 2 |
| Work Saban index.html | 0 | 21 |
| Clearly synthetic defective HTML fixture | 4 | 6 |
| **Total** | 4 on HTML inputs | **30** across four inputs |

**Important:** These are different detectors and rule families, not a like-for-like benchmark, confirmed WCAG failure count, browser evidence, or proof that one product is better. One tool can surface many advisory aesthetic preferences and another can find important defects it misses. A missing static finding is not a clean visual pass.

### Reported upstream rule families

**Headquarters:** 1 flat-type-hierarchy; standalone CSS: 1 gradient-text and 1 overused-font.

**Work Saban:** 4 low-contrast (advisory); 4 tiny-text; 4 undersized-ui-text; 3 border-accent-on-rounded; 3 numbered-section-labels; 1 each extreme-negative-tracking, hero-eyebrow-chip, and kicker-above-heading.

**Synthetic defective fixture:** 2 gradient-text; 2 undersized-ui-text; 1 tiny-text; 1 low-contrast. The first-party HTML sentinel found missing viewport, document language, image alt and placeholder link targets, which demonstrates the tools catch **different** issues.

## First owned response

The parallel first-party Design Contract branch in PR #2189 raises 10–11px Work Saban UI/metadata labels to 12px, darkens selected low-contrast grey text, and adds a regression test. This is a **source-only proposed fix**, not a merged public release or verified rendered accessibility improvement.

Do **not** automatically remove gradient headlines, numbered labels, accent borders or condensed tracking. Those are aesthetic observations that require human art-direction judgment and visual review against the product identity. Treat contrast findings as prompts for actual computed WCAG contrast checks, not proof of specific failures without rendered evidence.

## Next acceptance criteria

1. Verify PR #2189's browser/mobile workflow on the changed branch, with screenshots and focus/readability checks.
2. Re-scan the changed Work Saban code with the same pinned Impeccable version and compare **rule categories**, not merely totals.
3. Add only validated false-negative detection logic to the owned Human Experience/Customer Gauntlet contract (including a bounded CSS scanning lane if beneficial).
4. Re-run the same synthetic fixtures plus a held-out public page and show false positives/negatives and accessibility checks.
5. Keep the third-party detector confined to optional, ephemeral, separately authorized QA until dependency, license, privacy, security and rollback admission is complete.

This proof supports the Evercraft external-capability strategy: evaluate actual code, measure useful gaps, improve first-party systems, retain product independence. It does not authorize external tool installation, third-party model calls, or production execution.

## Same-engine follow-up, exact revised source

**Verification run:** https://github.com/jgaethle10/forge-operator/actions/runs/43829310022
**Proposed Work Saban revision:** commit f910f5faf51e1535a6d5cea4d3b1b73076e33e0c, Git blob SHA-1 001b7f53646c52484a19f045c8ab08a689f5305e; both captured and independently checked by the workflow before isolated scanning.

The same pinned Impeccable engine and scan flags reported **21 findings before** and **10 after** on Work Saban source, a reduction of 11 static findings.

- tiny-text: 4 → 0
- undersized-ui-text: 4 → 0
- low-contrast advisories: 4 → 1
- remaining after revision: 3 border-accent-on-rounded, 3 numbered-section-labels, 1 extreme-negative-tracking, 1 hero-eyebrow-chip, 1 kicker-above-heading, 1 low-contrast advisory

These results support that the textual source changes addressed detector-flagged readability risks. The remaining source flags are mostly aesthetic judgments, not validated defects. The Work Saban real-browser acceptance workflow separately completed successfully on the design PR branch; neither test certifies every visual or WCAG criterion. PR #2189 remains unmerged at the time of this entry.

**Learning transferred:** make readability and visual hierarchy an explicit first-party design contract, retain a held-out synthetic fixture, and require a reproducible before/after scan before promoting an external design tool's recommendation.
