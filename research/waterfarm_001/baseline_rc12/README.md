# Evercraft Aqua RC12: Single-meter field kit

First useful case for prospective agricultural operators with **one existing water totalizer** and optional pump kWh. Completely separate from the stricter two-meter RC11 baseline. This is a research preview and is **not deployed**.

## Use on a phone or computer

1. Save or open `Evercraft_Aqua_RC12_One_Meter_Field_Kit.html` in a browser capable of running local JavaScript. The browser-based file-delivery behavior on native iPhone Safari has not been verified.
2. Tap **Explore synthetic demo** to inspect the UI. It explicitly declares fictional readings and cannot be imported as real evidence.
3. Tap **Get blank CSV template**. It has 15 local calendar dates ending on the date the template was generated. Edit dates to reflect the actual reading days, fill the same source meter ID and cumulative reading, and set the units (`L`, `US_GAL`, or `M3`). Leave pump kWh empty if genuinely unknown; do not enter false zeros.
4. Import a completed CSV with **Choose CSV file** or paste its text. Hit **Analyze locally** for pasted text. Input stays in memory in this browser, with no upload or remote request.
5. Download the JSON audit if the 14-day intake passes. The audit remains explicitly **OPERATOR_SUPPLIED_UNVERIFIED**. Keep sensitive raw readings and any exported report private.

A CSV requires exactly these columns in order:

`date,meter_id,cumulative_reading,units,pump_kwh_since_previous,observation_kind`

For a real operator-supplied record, every row must use `OPERATOR_SUPPLIED_READING`; the first day's pump-energy field is blank because there is no prior interval.

## Reproduce QA

From this directory:

```
node --test tests/core.test.mjs
python tests/parity.py
python tests/browser_qa.py
```

Browser QA loads HTML into a Chromium test document because direct file:// navigation is blocked by this execution environment. The browser renders the actual app's scripts and CSS and tests interactions; it is not an iPhone hardware test.

The zero-network design is intentional: no sensor actuation, backend, SaaS dependency, payment or customer data storage. No water-savings claims or verified leaks.
