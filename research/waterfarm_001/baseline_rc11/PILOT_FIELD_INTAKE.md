# Aqua field measurement, first operator review (draft)

**Purpose:** Voluntary, read-only review of existing measurements. The operator retains control of the property, records and equipment. This is not an equipment quote, permit or water-management directive.

## What a consenting operator would need to provide privately

- **Consent/terms:** who may analyze measurements, data-retention window, right to withdraw, whether any party may share summarized findings and which site identifiers must remain private. Written receipt required. A JSON Boolean or hash alone does not prove consent.
- **Water topology:** site-approved sketch of source supply, other water uses, irrigation meter, storage and any return flows; qualified person's independent review receipt. Without this, unexplained inlet/outlet differences remain **UNKNOWN**.
- **Meter proof:** 14 or more consecutive days of dated source and irrigation totalizer readings in liters, distinct meter IDs, model/serial/units, calibration and accuracy documentation, recorded time conventions and gaps/resets identified. No invented readings or estimates in the measured channel.
- **Energy:** actual whole-system pump electricity in kWh covering matching dates and a reference for the energy instrument's calibration. Nameplate horsepower or pump kW alone is not kWh use.
- **Crop/environment context:** irrigation purpose, soil, crop stage/ET, relevant weather and rainfall, known restrictions. This context is for expert review, not automated irrigation instructions.
- **Cost:** actual marginal avoidable water charge or pumping cost, electricity tariff and any maintenance costs, separated from sunk/unavoidable fees.

## Allowed actions before an engineering/site release

Only inspect supplied records and generate an offline, source-hashed audit. A successful `pilot_gate.py` run says **DOCUMENTARY_PRECHECK_COMPLETE_UNAUTHENTICATED**, not “approved to operate,” and presents no proof of water saved. A qualified reviewer must independently inspect the original instrument, boundary and consent materials before any operational recommendation. A separate safety/regulatory and operator approval is needed before any physical changes to pumps, controls, collection plumbing, crop reuse or drinking-water systems.

**Privacy:** Don't commit actual site telemetry, signature pages, detailed maps, GPS coordinates or customer identities into the public `forge-operator` repository. Use an approved private evidence vault with revocation and access records when one is available. No vault integration has been configured by this research package.