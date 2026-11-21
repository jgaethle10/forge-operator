# HIST-TECH-001 | Stage 9: Physical Bench Candidate and Independent Review Dossier

**Prepared:** 2026-11-11. **Decision:** NO-GO FOR ENERGIZED EXPERIMENT OR SCIENTIFIC CLAIM. No physical kit or meter has been purchased, borrowed, configured, operated, or tested by Evercraft. No independent reviewer has approved this design. This is a documented *candidate and decision package*, not an equipment order.

## Objective and boundaries

Question: For a commercially supplied, low-voltage inductive DC-transfer module, how do whole-system **DC power-entry to loaded receiver DC output** energy ratio and control results vary with coil gap, angular misalignment and load? This tests ordinary induction. It cannot establish energy creation, Wardenclyffe-scale operation, novel medical effects, global transmission, or actual validation of the ideal filament model.

Keep all actual raw observations and calibrations private in a scoped local evidence directory until independently reviewed. The software uses separate *synthetic* fixtures; no measured data is in this repository.

## Candidate A: low-cost educational inductive set, **NOT approved**

- **Adafruit item 1407, Inductive Charging Set - 5V @ 500 mA max**, listed at **$9.95** on its official page (price snapshot; pricing and stock are not guaranteed).
- Vendor reports **9–12 V DC transmitter input**, **5 V DC loaded receiver output**, and about **500 mA only at 2–3 mm separation**. At approximately 7 mm the vendor describes 100–200 mA possibilities, not a verified operating guarantee. Vendor also reports roughly **40%** energy throughput and approximately **70 mA quiescent draw**, not independently calibrated Evercraft data.
- The supplier explicitly states: **no full datasheets/specifications are available**. A downstream datasheet listing that reproduces product text is not a complete electrical schematic, certification, power-entry/EMI specification or traceable performance test.
- Exposed wires and compact PCBs would require appropriate insulation/enclosure and qualified safety review. No battery charging, live mains, direct human attachment, medical use, high-voltage coil construction, firmware modification or soldering modifications are proposed.
- **Decision:** potentially acceptable only as a *basic teaching demonstration* after physical safety review and confirmation of input current limits. **Reject as a calibrated reference for a precise efficiency claim until manufacturer limits, actual DC test points and physical installation are approved.**

Primary product source: https://www.adafruit.com/product/1407
Independent distributor identification: https://www.digikey.com/en/products/detail/adafruit-industries-llc/1407/5761213

## Candidate B: DC measurement instrument, **NOT purchased or approved**

- **Joulescope JS220**, precision DC energy analyzer. Manufacturer documents synchronous voltage/current sampling **within one unit**, up to **2 MSPS**, around **300 kHz analog bandwidth**, recommended DC voltage sensing to **±14.5 V** and **±3 A sustained** current range. Host support includes Windows and Linux. A BNC trigger connection is documented.
- Vendor store snapshot indicated **$999 per unit** and **sold-out variants**. This is not a purchase recommendation, price quote or reliable delivery promise.
- A whole-system test would require **at least two independently reviewed measurement channels**: one on total transmitter DC input and another on loaded receiver DC output, plus additional source channels for any auxiliary supplies. Separate instruments being individually synchronous for V/I **does not automatically demonstrate inter-instrument clock synchronization**. A qualified reviewer must verify clock skew, trigger wiring, sample alignment and acquisition tooling before data may be considered time-matched.
- Manufacturer ratings do not replace calibration certificate verification, measurement uncertainty calculations, instrument burden/insertion effects, electromagnetic susceptibility review or properly defined source/load boundaries. A qualified reviewer may instead prefer an existing calibrated multichannel data acquisition system or independent test lab.

Manufacturer source and official specifications:
https://docs.joulescope.com/en/products/js220/datasheet.html
https://docs.joulescope.com/en/products/js220/guide/specifications.html
Vendor store price/status snapshot:
https://www.joulescope.com/pages/support

## Equipment decision table

| Item | Selection state | Approval prerequisite |
| --- | --- | --- |
| Inductive DC sender + receiver | Adafruit 1407 **screened, not selected** | Actual datasheet/rating gap resolved or independently reviewed as educational-only test item |
| Manufacturer-approved 9–12 V current-limited DC source | Unselected | Rated current under worst-case load, safe isolation and shutdown; manufacturer input requirements reviewed |
| Meter(s) for total input and loaded output, with independent raw logs | JS220 **screened, not selected** | Measurement range, burden, clock alignment, calibration and budget |
| Additional meters for any independent auxiliary supply | Unselected | Inventory all power sources before energizing |
| Known, appropriately rated load | Unselected | Voltage/current/power/thermal rating and stable DC loading |
| Nonconductive coil mounting and nonmetallic measured spacers | Unselected | Stable repeatable gap, clearance, protected terminals |
| Thermal supervision, emergency disconnect and enclosure | Unselected | Written safety and intervention limits; competent supervisor |
| Provenance and uncertainty records | Framework exists; physical records absent | Independent reviewer, original logs, calibration traceability, NIST TN 1297 budget |

**No purchases and no supplier contact were initiated.** The sensible spending decision today is **$0**, pending qualified review and a check for accessible borrowed/metrology-lab instrumentation.

## Controlled test matrix, pending approval

- Establish a DC loaded baseline with coils **coaxial at approximately 2–3 mm** (only within the selected module's manufacturer-safe envelope). Propose **at least 3 independently restarted repeats** at each *approved* gap and load, with stabilized input and output observations.
- Test another approved gap at a supported lower load, e.g. about **5 mm and 7 mm**, **only if** vendor performance and instrument dynamic ranges permit. Do not extrapolate the 500 mA rating to 7 mm.
- For each gap, record a **matched** angular-misalignment control with identical gap, source, load and ambient conditions, plus a **receiver-absent** control. Note that a receiver-absent condition may leave transmitter quiescent input draw; it should not create a spurious loaded receiver-output claim.
- Record gap, angle, actual coil geometry, load, supply limits, ambient and device temperatures, input and receiver output currents/voltages, power boundary points, instrument setup and full timestamps. Separate ideal-filament mutual-inductance predictions from complete circuit/efficiency observations.
- Collect the full energy-source inventory including auxiliary controllers, batteries, instrumentation injecting power and changes in stored energy.
- Where input/output signals fluctuate too fast or have ripple, **DO NOT** use the existing slowly varying DC trapezoidal importer as a precision wattmeter. Require a reviewed waveform-bandwidth and sampling/aliasing method with appropriately synchronized acquisitions.
- Stop for overheating, abnormal emissions or interference, overcurrent, insulation problems, unstable load, meter overload or any step outside documented ratings.

## Falsification and go/no-go acceptance

**Before energization: all must be independently evidenced, not merely checkboxes declared true**
1. Named qualified electrical/metrology reviewer has independently inspected apparatus, manufacturer specifications (or documented limitations), all physical supply and load connections, cable/fixture safety, measurement bandwidth and timebase, power-entry boundaries and uncertainty method.
2. Rated supply, load and thermal safe limits verified and recorded; owner has approved *specific* hardware, space, operator, and safety method.
3. Identified meters have calibration records and documented accuracy in the selected voltage/current/range, including a method to synchronize multiple channels.
4. Stop conditions and any emergency disconnect have been verified without unsafe manipulation of the live apparatus.
5. Original data acquisition and secure evidence handling are arranged. **Self-declared manifest SHA-256 only checks that file bytes match hashes.**

**After supervised trials:** Require complete source-to-load joules, confidence/uncertainty analysis per NIST TN 1297 including Type A/Type B contributions and covariance, control repetitions, independently original raw data and at least a second critical review. Apparent >100% output/input must trigger metrology investigation, **never** automatic claims of anomalous energy.

NIST uncertainty methods:
https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-5-combined-standard-uncertainty
https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-7-reporting-uncertainty

## Reviewer response form (copy into issue or signed document)

- **Reviewer and relevant competence:** NOT ASSIGNED
- **Apparatus reviewed:** NOT SELECTED
- **Instrument(s), calibration and inter-channel sync:** NOT VERIFIED
- **Power source inventory and measurement boundaries:** NOT VERIFIED
- **Uncertainty budget Type A/B, covariance, sampling:** NOT VERIFIED
- **Thermal, EMI, electrical isolation and abort controls:** NOT APPROVED
- **Authorized operator, date, location and supervising person:** NOT SET
- **Independent go/no-go decision:** **NO-GO**
- **Dissent, changes requested, supporting evidence links:** PENDING

A green GitHub CI suite is a *software* receipt. It does not substitute for any of these approvals. The PR stays draft; neither Systemia/Saban mission execution nor commercial launch is authorized.
