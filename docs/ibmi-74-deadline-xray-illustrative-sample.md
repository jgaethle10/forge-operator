# IBM i 7.4 Deadline X-Ray
## Illustrative specimen, not a customer assessment

**Evercraft IBM i Rescue | Fixed-price scope: $250 | Specimen date: October 7, 2026**

**Evidence disclaimer:** This is an *illustrative template using published IBM guidance*. No customer's configuration, applications, PTFs, batch jobs, licenses, vendor contracts, hardware, downtime tolerance, or paid order have been inspected. Every example relationship below is a **hypothetical question**, not an observed finding. A delivered customer report requires their explicit authorization and a qualified reviewer.

### Executive finding: what can be known before opening a system

**Publicly verified:** IBM i 7.4 left standard support on **September 30, 2026**; IBM's service extension began October 1, 2026 and is scheduled through September 30, 2029, subject to the applicable IBM terms, component exceptions, and entitlements. The software has not automatically stopped working, and the correct change decision depends on the customer's environment.

**Source:** IBM lifecycle: https://www.ibm.com/support/pages/ibm-i74x and https://www.ibm.com/support/pages/release-life-cycle . IBM extension scope: https://www.ibm.com/support/pages/system/files/inline-files/IBMiandLPPsforIBMi_02_26_2026.pdf

**Not yet knowable for any individual buyer:** exact release/TR/PTF level, supported POWER model, vendor product requirements, service extension coverage of installed components, upgrade target feasibility for that machine, impact on custom RPG/CL workflows, or acceptable downtime.

### 1. Bounded dependency map

| Candidate dependency | Relationship to test | Evidence state | What the customer must supply or authorize |
|---|---|---|---|
| Nightly order-batch job | *Illustrative:* scheduling -> program -> database -> external fulfillment | **Hypothesis**, not observed | Job schedule, authorized dependency listings, owner-confirmed business impact |
| ERP or warehouse interface | *Illustrative:* RPG/CL process -> vendor connector -> EDI/SFTP endpoint | **Hypothesis**, not observed | Licensed application/vendor list, safe architecture notes, interface owner |
| Db2 for i application data | *Illustrative:* queries and schema behaviors may have compatibility constraints | **Hypothesis**, not observed | Authorized schemas/dependency reports, application versions |
| Backup and recovery | *Illustrative:* restore path may constrain cutover readiness | **Hypothesis**, not observed | Existing backup plan and recent independently verified restore test |

**Boundary:** No private access, credentials, security inspection, or production probing is included in the $250 public X-Ray without separate explicit authorization. This report does not test or certify any system.

### 2. Support-transition and upgrade assumptions register

| Question | Current public evidence | Status |
|---|---|---|
| Did IBM i 7.4 standard support end? | IBM lifecycle states September 30, 2026. | **Verified public** |
| Is service extension available? | IBM lists October 1, 2026 to September 30, 2029. Coverage and pricing depend on terms and components. | **Verified public; customer entitlement unknown** |
| Is any named customer's upgrade urgent? | Cannot be determined from the support calendar alone. | **Unknown** |
| Can a system on 7.4 upgrade directly to 7.5 or 7.6? | IBM describes software source/target pathways; hardware model, license and prerequisites require separate verification. | **General rule known; buyer-specific fit unknown** |
| Is an installed integration or vendor product supported on the target? | The provider's certified matrix and installed version are needed. | **Unknown** |

IBM reference for release compatibility: https://www.ibm.com/docs/en/i/7.6.0?topic=replacement-releases-supported-system-model-information-i-upgrades

### 3. Vendor, hardware, fix and integration risk register

- **Hardware:** match the actual machine model and configuration to IBM's approved target-release matrix; do not infer compatibility merely because the current OS runs.
- **PTFs:** identify the target release, installation method and IBM's *current* required PTF/PSP guidance; verify installed fix state from authorized customer evidence. These prerequisites can differ by 7.5 versus 7.6 and by virtual/NFS media.
- **Licensed programs:** collect product/version and vendor maintenance requirements. IBM i OS support does not automatically extend the same terms to every licensed component.
- **Third-party integrations:** list the real authentication, driver, messaging, printing, EDI, API and scheduling boundaries. A missing integration inventory is a finding of incomplete knowledge, **not** an observed outage risk.
- **Test data and recovery:** document an authorized nonproduction strategy, representative business cases, rollback decision-maker and objective recovery constraints before choosing a change window.

IBM upgrade reference: https://www.ibm.com/support/pages/install-upgrade-migrate-and-recovery-ibm-i-os-documentation-quick-reference
IBM general readiness checklist: https://www.ibm.com/docs/en/i/7.4.0?topic=software-checklist-i-upgrade-replacement-readiness

### 4. Practical next-step test and rollback plan

1. **Confirm decision scope** with the buyer: one representative workload; reason for contemplating an upgrade or extended support.
2. **Capture customer-authorized system facts**: release/model, installed programs, relevant fix and interface information. Never request admin secrets by email or public checkout form.
3. **Review IBM guidance** for the specific source/target release, hardware, install method and PTFs, and seek vendor-specific confirmation where needed.
4. **Map one business-critical transaction** to jobs, programs, external interfaces and data dependencies. Separate verified edges, operator statements and unresolved assumptions.
5. **Draft nonproduction tests** for the workflow and integrations. Define baseline output, acceptable drift, owner, estimated impact and pass/hold criteria.
6. **Prepare rollback questions**: recovery/backup evidence, dependency compatibility, freeze/cutover authority, restore-test receipts and conditions requiring an abort. Implementation remains separately approved.
7. **Deliver reviewed four-part X-Ray** identifying exactly which unknowns still prevent a recommendation; no false certification.

### Recommended decision at illustrative stage

**HOLD buyer-specific upgrade advice until real facts are supplied and qualified review completes.** This is not a recommendation to immediately upgrade, remain on 7.4, or buy extended support. It demonstrates how Evercraft structures a bounded decision with sources and explicit unknowns.

### How to request the real $250 X-Ray

Offer page (subject to production checkout verification):
https://fabric.systemiacommandcenters.com/offers/ibmi-74-deadline-xray

The buyer selects the service, confirms checkout personally, and provides an authorized bounded scope. Evercraft Payments must independently verify settlement before Systemia starts customer-specific fulfillment. A purchase never authorizes privileged access or production changes.

**Evercraft is an independent service and does not claim endorsement, accreditation, reseller status, or a formal affiliation with IBM.**
