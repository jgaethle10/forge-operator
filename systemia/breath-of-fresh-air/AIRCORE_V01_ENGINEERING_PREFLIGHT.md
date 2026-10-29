# Breath of Fresh Air: AirCore V0.1 (engineering preflight)

**State: DESIGN ONLY.** No working ventilation or filtration prototype, CADR measurement, air-quality health claim, certification, purchase, or manufacturing approval is implied.

## Mission
Prove a **removable, low-voltage, sealed recirculating particulate air cleaner** on a standalone bench before installing it into an original Refresh Table furniture design. The Thuma reference is aesthetic/commercial inspiration, **not** an affiliation, copied design, license, partnership, or approved outreach.

### Explicit separation
- **Phase A: recirculating air filtration.** Room air enters a guarded grille, passes a removable prefilter and sealed high-efficiency particulate filter, reaches a downstream centrifugal/EC blower, and is returned via a separated outlet diffuser.
- **Phase B: true ventilation** (fresh outdoor air, building penetrations, outdoor pollutants, pressure balance, condensation, heating/cooling and code review) is a separately gated project. No "fresh-air exchange" claims for Phase A.
- No ionization, ozone, unverified UV, scents, or odor/gas removal promises in V0.1.

## Baseline design inputs (changeable hypotheses)
- Application: 200 ft² room, 8 ft ceiling, 5 equivalent air changes/hour.
- Particle smoke-CADR *target*: 133.3 CFM (EPA table rounds to 130 CFM).
- Assumed effective single-pass particle capture: 0.90; assumed bypass: 0.05. Both **unverified**.
- Derived fan **operating-point** flow: about 156 CFM, not free-air advertised CFM. Measure through a loaded enclosure; revise when actual filter efficiency and leaks are known.
- Proposed intake: **two 10 × 9 in grilles**, each *assumed* 55% open. Combined gross area 180 in², net 99 in²; nominal face velocity ~227 fpm. Outlet requires independent equal-or-better free area, directional separation, and obstruction testing.
- Nominal filter face: 12 × 16 in (192 in²); ~117 fpm calculated frontal velocity. Actual media surface area/pressure drop depends on pleats and cartridge.
- Fan technology for selection: guarded 24 V brushless **centrifugal/EC blower** compatible with PWM speed control and sufficient static-pressure curve. **No specific fan part or 24 V current rating selected yet**.

### Architecture
```text
ROOM INTAKE (2 side grilles; keep clear of carpet/curtains)
   -> removable coarse prefilter
   -> gasketed particulate filter cartridge
   -> negative-pressure plenum / downstream blower
   -> guarded, baffled OUTLET away from intakes
   -> ROOM
```
Filter service: slide-out, user-replaceable with captive seals, keyed orientation, tool-free access **only when powered off**. Accessible fan blades and wiring must remain guarded. Furniture structural loads must bypass the airflow module. No electronics enclosed in sealed wooden cavities without thermal assessment.

## Build-before-buy gates
1. **G0 document package:** airflow schematic, provisional envelope, parametric sizing, risk register, measurement plan (this draft).
2. **G1 component screening:** obtain blower P-Q curve, filter pressure-vs-flow curve and mechanical dimensions. Identify at least two viable matched blower/filter sets at clean and end-of-life resistance. Do not buy based on nominal CFM alone.
3. **G2 bench rig:** safe guarded external low-voltage supply (certified/listed supply), fuse/protection and independent on/off; serviceable filter seals; no household mains wiring inside experimental furniture.
4. **G3 measurement:** record differential pressure (clean and simulated aged filter), measured outlet airflow at high/medium/low speeds, intake/exhaust recirculation, power, sound at fixed 1 m setup, temperature rise and vibration. Keep calibration and uncertainty records.
5. **G4 particle reduction:** repeated paired decay runs with control background decay, fixed room volume, same test location, and humidity/outdoor-air notes. Particle sensor trends are **not a certified CADR result**. Commission standardized ANSI/AHAM AC-1 CADR verification before claims.
6. **G5 furniture integration:** only after G2-G4, measure tabletop loads and tip resistance, splash/child access/cord pinch, surface temperature, emissions from finishes, service access and blocked-grille response. A qualified product safety specialist selects the applicable product standard(s).
7. **G6 commercial:** consented user testing, independent CADR, electrical/fire safety and emissions evaluation, filter replacement economics and published warranty. No Thuma contact representing a working product until evidence is assembled.

## Preliminary engineering targets (NOT achieved)
| Item | Candidate target | Evidence to collect |
| --- | --- | --- |
| Particle CADR | >=130 CFM smoke CADR at rated mode | Independent AC-1 test |
| Grille face velocity | <=250 fpm at rated flow | In-situ flow measurement |
| Sound at rated speed | <=50 dBA at 1 m (aspirational) | Calibrated sound measurement, defined room |
| Average/eco mode sound | <=40 dBA at 1 m (aspirational) | As above, with measured reduced CADR |
| Rated electrical draw | <=50 W aspirational | Wattmeter at rated mode |
| Dirty filter | No unsafe thermal rise, measured flow and maintenance trigger | Conditioned-load test |
| Service | Replace cartridge without tools or contact with impeller | Human factors trial |
| Safety | No exposed mains, safeguarded fan, stable furniture | Product safety assessment |

## Candidate component classes (not a purchase order)
- 24 V EC centrifugal blower with vendor fan curve at static pressure
- tested high-efficiency pleated particulate filter and gasketed cartridge
- washable coarse prefilter, two substantial side intakes, detached upper/rear diffuser
- low-voltage fuse and controller with fail-safe thermal supervision
- certified external DC supply sized *after* blower selection
- differential pressure taps, flow hood/duct flow sensor, power meter, sound meter, particulate sensors for **exploratory** tests
- noncombustible or suitably assessed prototype plenum; mechanically isolated blower mounts

## Design risks to retire
1. Free-air CFM collapse at filter pressure drop.
2. Intake-to-outlet short-circuit reducing true room cleaning.
3. Furniture geometry too small for a low-noise 130 CFM particle CADR.
4. Bypass leaks and maintenance error.
5. Added heat, vibration, blocked grille, dust accumulation, and combustible furniture materials.
6. Claim confusion: room filtration is not ventilation; particle capture is not gas/VOC removal.
7. Subscriptions and replaceable filter access remain business hypotheses until real customer testing.

## Source references
- EPA sizing chart: https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home
- AHAM CADR and 2/3 sizing rule: https://ahamverifide.org/ahams-air-filtration-standards/
- AHAM published standards list: https://www.aham.org/AHAM/Standard_Chart_Page.aspx
- EPA ozone and source control cautions: https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-hvac-filters-and-respiratory-viruses

**Systemia truth:** This source artifact is **not** a dispatched Saban mission, laboratory proof, hardware build, or partner outreach. Future mission admission needs its own canonical Systemia receipt.
