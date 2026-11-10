# Aqua RC13 | First consenting operator pilot protocol (proposed, not activated)

**Purpose:** test whether Aqua can accurately organize *reported* source withdrawals with little operator effort. **Not:** certify irrigation efficiency, measure leaks, claim water saved, calculate ET, give water-right advice, or actuate equipment.

## Start condition

An operator volunteers, agrees to a limited read-only measurement pilot in writing, identifies an *existing* source water totalizer, and confirms units and approximate daily reading time. Keep their identity and any private site records outside public repositories. Request calibration and source-boundary documents separately; the app itself cannot verify them. Existing meter use only: no installs or changes to water infrastructure.

## Fourteen-day measurement window

The operator records totalizer on the opening day and fourteen subsequent days (15 readings), at approximately the same local time. Record the same meter, with units fixed as L / US_GAL / M3. Pump energy consumption for each preceding interval is optional, but never estimated to zero. Export the CSV after each measurement as an offline backup. Do not log sensitive addresses in meter labels.

## Stop and escalation rules

- Missed/duplicate reading or date, power or meter reset, rollover, inaccessible meter, ambiguous units -> pause and independently reconcile; never auto-fill a day.
- Source water meter not on a known boundary or used for multiple non-irrigation purposes -> withdrawal baseline only, not an irrigation use measurement.
- Suspected contamination, cross-connection, electrical unsafe conditions or legal water-right questions -> qualified professional, **no field action by Aqua**.
- A graph change between days is not a verified leak, saved water, crop demand or treatment effect.

## Acceptance checklist

- [ ] Site operator's written consent and data handling terms exist separately.
- [ ] Exact unit, model/serial and photo/record of existing meter verified by authorized reviewer.
- [ ] Source boundary and any other uses/storage documented, with uncertainty acknowledged.
- [ ] 15 consecutive readings, no known rollovers or data gaps.
- [ ] At least two independent calculation paths reproduce the total and per-day intervals.
- [ ] Backup and audit files' SHA-256 fingerprints recorded; source authenticity independently reviewed.
- [ ] Operator and engineer agree interpretation remains a **withdrawal baseline**, not proven loss or conservation.
- [ ] No private data exposed in public source, media, or publication.

## Step after the first trial

Compare data quality and user effort first; only if site review and meter corroboration succeed, consider a separate **intervention study** with measured control/baseline, appropriate crop and weather context, actual marginal costs, hydraulic professional review and independent safety/end-use approval. The smallest safe comparison is preferable to an expensive recovery installation.
