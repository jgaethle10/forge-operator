# HIST-TECH-001 | Stage 10: Verified External Reviewer Routing

**Prepared:** 2026-11-15. **Status:** real contact routing researched, preliminary review packet assembled. NO EXTERNAL REVIEW HAS OCCURRED. No paid engagement, no signed contract, no safety certification, no experimental work, and no permission to energize equipment. All contacts are preliminary leads; suitability, cost, capacity, and willingness are unknown.

## What the reviewer is being asked to examine

The technical question is narrow: whether an independently monitored, low-voltage inductive wireless-power demonstration could responsibly measure **DC supply-entry energy versus loaded DC receiver energy** across repeat trials at controlled geometry. Not claims about "free energy," over-unity output, medical cures, Wardenclyffe-scale transfer, or proof of suppression.

The first reviewer must identify missing supply/load boundaries, calibrated instruments, sampling/clock alignment, thermal safety, foreign-object heating, correctly defined controls, and NIST TN 1297 uncertainty budget requirements. The source-only code has 78 passing synthetic/regression tests as of 2026-11-11; these are NOT laboratory performance results.

## Grounded external review paths

| Lead | Verified public contact | Why it merits outreach | Limit |
| --- | --- | --- | --- |
| Central Washington University, Electrical Engineering Technology | **Greg Lyman**, greg.lyman@cwu.edu; EET departmental alias eet@cwu.edu; [CWU faculty page](https://www.cwu.edu/about/directory/eng-tech-safety-construct/greg-lyman.php) | Greg Lyman teaches instrumentation with sensors/data acquisition and analog/digital circuits; local electrical engineering technology program and IEEE chapter | Faculty availability, consultant eligibility, calibration capabilities and independence are **not confirmed** |
| WSU Tri-Cities, Electrical Engineering | **Scott Hudson**, scott_hudson@wsu.edu; [WSU faculty list](https://tricities.wsu.edu/engineering/faculty/) and [faculty research profile](https://tricities.wsu.edu/engineering/faculty/hudson/) | Program lead/professor of electrical engineering with research in electromagnetics, relevant to assumptions/coupling and physical test design | Expertise does not imply willingness to review, ability to sign safety approvals, or instrument access |
| Global Calibration Services, Tukwila | **info@gcscal.com**; [official contact](https://www.gcscal.com/contactus.html), [A2LA listing 2367.01](https://customer.a2la.org/index.cfm?event=directory.detail&labPID=4723A3F4-8D36-4B00-90D4-7DFC4F18B69C) | Self-described ISO/IEC 17025 calibration laboratory accredited in electrical and other measurement disciplines, potential source for traceable meter calibration or referrals | **Accreditation is scope-specific**; whether it can provide the exact service, equipment, or independent method review is unknown |
| Connetix Engineering, Yakima | [official contact page](https://coneng.com/contact/) (web form and 509-965-9872) | Local electrical engineering design/controls and instrumentation; lists oscilloscopes and data acquisition capabilities [About](https://coneng.com/about/) | Business service focus may be industrial power/controls rather than small resonant-inductive metrology; no review availability, fee, or ability confirmed |

These are **outreach candidates only**, not selected reviewers, partners, suppliers, or commissioned institutions. Academic affiliation is not certification of metrology competence. Formal calibration requires review of the lab's **specific accredited scope and measurement uncertainties**.

## Contact sequence, effort control and response ledger

1. **CWU Greg Lyman:** short technical feasibility/referral request, emphasizing known limitations and asking whether there is a faculty or lab route for a modest, non-commercial *review of the proposed measurement plan*. Avoid implying free or student labor.
2. **WSU Scott Hudson:** independent electromagnetics/methodology critique and referral to a metrologist. Keep external claims conservative and ask about availability/requirements.
3. **Global Calibration Services:** ask whether the lab's actual scope includes traceable DC voltage/current or DC power calibration in the expected low-voltage range, whether it can review sampling/synchronization, and what pricing/dependencies apply.
4. **Connetix:** if a local professional engineer or lab review is required and academic routes are unavailable, use their official form to ask for a small scoped quote, no commitment.

**Draft status:** Messages can be prepared for review without sending. A created draft does NOT establish contact or an active review request. No vendor has responded, accepted scope, offered calibration, provided equipment, or quoted a price.

| Follow-up evidence | Current state |
| --- | --- |
| CWU message delivered, reply, and named reviewer | NOT SENT / NONE |
| WSU message delivered, reply, and named reviewer | NOT SENT / NONE |
| Calibration lab scope/quote | NOT SENT / NOT CONFIRMED |
| Professional engineering quote, if required | NOT REQUESTED |
| Reviewer signed decision, uncertainty method and safety scope | NOT COMPLETE |
| Owner equipment and purchase authorization | NOT AUTHORIZED |
| Real measured data/physical energy results | NONE |

## Exact review questions to request in writing

- Is this candidate low-voltage inductive kit technically appropriate for **educational comparisons**? Vendor Adafruit 1407 lacks full datasheet, so what manufacturer limits or substitutions are required?
- What are the defensible **DC source-entry** and **loaded receiver-output** measurement points and required auxiliary input/stored-energy inventory?
- Does a simple synchronized DC time-series method suffice, or do carrier ripple and bandwidth force waveform-resolved V(t)I(t) and anti-alias review?
- If independent meters are used, how will inter-device time alignment be proven, and how will burden, range, drift and environmental effects be characterized?
- What exact NIST TN 1297 Type A, Type B, covariance and coverage-factor calculations should the final record use?
- Which negative controls and independent repeats are adequate for the narrow educational hypothesis?
- What electrical/thermal/interference stop conditions need to be explicitly approved before equipment is energized?
- Could the reviewer inspect our source-only PR and provide written deficiencies **without purchasing equipment**, and can they disclose whether a fee would apply?

## Independent review packet

- [PR #1836](https://github.com/jgaethle10/forge-operator/pull/1836), [parent research #1835](https://github.com/jgaethle10/forge-operator/issues/1835), [approval gate #2088](https://github.com/jgaethle10/forge-operator/issues/2088)
- [BENCH_CANDIDATE_REVIEW.md](BENCH_CANDIDATE_REVIEW.md), [BENCH_PROTOCOL.md](BENCH_PROTOCOL.md), [ACQUISITION_HANDOFF.md](ACQUISITION_HANDOFF.md)
- [TIME_SERIES_PROTOCOL.md](TIME_SERIES_PROTOCOL.md), [EVIDENCE_INTAKE.md](EVIDENCE_INTAKE.md), [MODEL_VERIFICATION.md](MODEL_VERIFICATION.md)

## Stop/go logic

**NO-GO now.** A reply, a referral, or public faculty bio does not constitute independent approval or lab competence certification. The issue #2088 gates remain open until a specifically qualified named reviewer documents the actual apparatus, metrology, safety, and uncertainty work, and the owner separately authorizes physical activity. GitHub and Gmail drafts do not create Systemia execution receipts.
