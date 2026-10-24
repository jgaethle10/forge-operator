# Evercraft Aqua / WATERFARM-001

**State:** advisory-only, bench-level simulation. Not a built water farm, potable water system, live site, control service or field claim.

Engineering mission: [#1604](https://github.com/jgaethle10/forge-operator/issues/1604).

The model makes a conservation-of-water ledger explicit. It does **not** manufacture water, predict local rainfall, certify water quality, issue water rights, operate pumps or certify compliance. All inputs are provided by the experimenter. Authorization defaults to false for every source and delivery path.

## Tests (Python 3.10+, standard library only)

```bash
cd research/waterfarm_001
python -m unittest discover -p 'test_*.py' -v
```

## Example, entirely hypothetical

```python
from waterfarm import Site, DailyObservation, simulate_day
site = Site(roof_area_m2=100, tank_capacity_l=1000,
            roof_capture_authorized=True, nonpotable_delivery_authorized=True)
print(simulate_day(site, DailyObservation(rainfall_mm=10, demand_l=100)))
```

At 10 mm rainfall, 100 m² roof and 0.8 capture coefficient, the model gives 800 L potential input. This excludes first flush unless configured, roof pollution and variable real losses; it is not a Yakima forecast. In Washington, roof collection is conditional on roof purpose, onsite use and other rules, and other plumbing / potable requirements may apply.

## Measurement contract

For every reading: UTC timestamp, calibrated meter ID, units, method, source, measurement uncertainty and whether observed or modeled. Track rainfall, tank level, inflow, demand, physically isolated condensate, condenser electrical kWh and external makeup water. Plant transpiration recapture is **internal recycling**, not a new watershed supply. The returned mass balance closes the modeled tank, not an entire greenhouse or basin.

Condenser kWh/L excludes filters, pumps, capital, maintenance and treatment. It is *not* full water cost. A device's kWh/L cannot establish climate-scale feasibility or potable suitability.

## Launch and safety boundary

- Research for **nonpotable applications** only; capture does not imply safe irrigation or drinking water.
- Keep condensate isolated until independent lab tests, compliant design, and end-use authorization.
- No plumbing, reclaimed-water distribution, surface diversion or discharge authorized by this code.
- Site-specific regulations, roof eligibility and water rights must be reviewed by qualified people.
- Any future physical controls require independent hardware interlocks and signed commissioning; advisory output cannot open valves.
- Stop on unapproved source, bad calibration, contamination or unresolved overflow.

## Immediate next experiments

1. Run provenance-backed 12-month climate scenarios with local meteorological data and site demand.
2. Calibrate scale/flow meters, kWh monitor and RH/temperature sensors.
3. Compare 14-day closed growing chamber control vs condensate recapture, with water quality held for verification.
4. Judge external freshwater savings and full costs against compliant alternatives, not manufactured yield claims.

Sources: [Washington Ecology rain policy](https://ecology.wa.gov/water-shorelines/water-supply/water-recovery-solutions/rainwater-collection), [EPA agriculture reuse](https://www.epa.gov/waterreuse/reusing-water-agricultural-activities-resources), [2026 AWH evidence](https://doi.org/10.1016/j.ecmx.2026.101928).
