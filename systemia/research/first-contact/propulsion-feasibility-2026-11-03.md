# FIRST-CONTACT-001 | ENG-001 electroaerodynamic propulsion feasibility
**Date:** 2026-11-03. **Status:** desk-only physics model and demonstration constraints; no prototype constructed.

## Established observation, distinct from UAP reports

Xu et al., *Nature* **563**, 532–535 (2018), DOI https://doi.org/10.1038/s41586-018-0707-9
MIT News primary institutional account: https://news.mit.edu/2018/first-ionic-wind-plane-no-moving-parts-1121

The MIT team flew a **5-meter-wingspan** fixed-wing airplane in **ten** powered indoor flights and carried onboard batteries and a **40 kV** power converter. The result was a proof of concept for electroaerodynamic forward propulsion through momentum transfer to air, **not** reactionless thrust, antigravity, vertical takeoff or an extraterrestrial mechanism. Aerodynamic lift from the wing still matters. MIT explicitly described the system as far from useful-mission performance and needing better efficiency, range and outdoor capability.

## Paper physics: screening calculator

A level-flying fixed-wing aircraft, within a specified operating point, requires `Lift = mg` and `Thrust = Drag ≈ mg/(L/D)`. If a hypothetical propulsion system can provide `R` newtons per kilowatt of **thruster input**, then `P_thruster = 1000 × Drag/R` W, and a power converter of assumed efficiency `η` draws `P_battery = P_thruster/η`. The ideal battery-limited time is `3600 × E_Wh / P_battery` seconds.

The `engineering-feasibility.mjs` calculator rejects invalid inputs and propulsive efficiencies above 100%, and clearly describes everything it omits. Input R is a *chosen performance assumption*. One contemporary secondary discussion reported ~5 N/kW for the 2018 flight system (https://arstechnica.com/science/2018/11/small-drone-soars-on-an-ionic-wind-with-no-moving-parts/). This number has not been independently re-read from Nature's detailed extended engineering table here; it is not a performance guarantee or a scalable universal constant.

### Deliberately illustrative scenario (not an MIT flight reconstruction)

| Hypothetical input | Assumption |
|---|---:|
| Fixed-wing total mass | 2.5 kg |
| Lift-to-drag ratio | 10 |
| Steady speed | 5 m/s |
| Electrical thrust-to-power | 5 N/kW |
| Usable battery energy | 40 Wh |
| Converter efficiency | 85% |

**Arithmetic only:** steady level thrust ~**2.452 N**; electrical thruster power ~**490 W**; battery power ~**577 W**; ideal battery-only endurance ~**250 s**; ideal still-air travel distance ~**1.25 km**.

These final two numbers **must not** be advertised as achievable flight endurance/range: they omit actual mass and drag budgets, battery constraints, launch, takeoff/landing, power-limited transients, environmental conditions and reserves, and they assume the stated thrust/power is valid at the selected airspeed.

## Gate: choose a practical technology objective

- **Candidate:** silent/low-moving-part fixed-wing lab-scale forward-propulsion research.
- **Not established:** scalable hover; extreme acceleration; no need for air; spacecraft propulsion; high payload.
- **Model gap:** a measured thrust vs airflow/airspeed vs electrical input curve, drag polar, converter thermals, emitter lifetime, atmospheric variation and charge/byproduct management.
- **Safety gap:** voltage levels in demonstrated EAD aviation hardware are dangerous; corona can produce reactive gases. No instructions or approval to construct or energize high-voltage hardware are supplied in this project.
- **Required before hardware:** independent engineering, aviation and electrical safety review, controlled facility, applicable regulatory requirements and qualified personnel.

**Recommendation:** keep this lane as a known-physics software trade study. No physical build until a bounded use case and safety authorization are documented.
