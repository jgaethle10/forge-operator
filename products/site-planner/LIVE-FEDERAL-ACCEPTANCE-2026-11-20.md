# Kennedy Site Planner | Live federal aerial acceptance receipt

**Executed:** 2026-11-20 16:40:46 UTC  
**Source:** GitHub Actions, Site Planner tests workflow, PR #2281, run `44775716847`, job `136424855429`  
**Commit:** `0ff3933b005e39d15aeffa96b205e5afcdb2be1f`  
**Fixture:** Public U.S. Census headquarters test address, 4600 Silver Hill Rd, Washington, DC 20233. No customer addresses or secrets.

## Actual check

The read-only `live_aerial_acceptance.py` called the production **U.S. Census** single-address geocoding API, then the production **USGSImageryOnly** MapServer twice. The GitHub job logs contain:

```
VALID site sha256 3cb6b3963465 bytes(base64) 194772
VALID vicinity sha256 bf9e29eb31e8 bytes(base64) 584008
LIVE FEDERAL AERIAL PROBE: PASS
Census matched: sample address only; parcel/imagery dates unverified
```

This is a **real provider-network acceptance on a GitHub-hosted runner**. It is *not* evidence of successful DNS/HTTPS retrieval from Evercraft Chromebook/NextGen, of address or parcel precision for real customer properties, or of actual image suitability for parking-stall drafting. The output image sources were not independently inspected for detail/resolution. The adapter verifies JPEG envelope markers and image SHA-256 bytes, not intrinsic photo georeferencing or vintage.

The federal service metadata describes NAIP imagery largely from **2017–2021** in the conterminous U.S., with service information updated June 2024. Do not describe an imagery export as live/current site conditions without independent dated source evidence. Only an operator can accept source rights and suitability; licensed engineering, utility capacity, and permits remain unverified.

## Operational consequences

- Live government endpoint integration demonstrated in CI with one public fixture.
- Separate opt-in `site-planner-federal-acceptance.yml` workflow remains available. The ordinary PR unit-test workflow no longer calls government services on every code change.
- The operator interface continues to require an unambiguous Census match and warns that address coordinates can be an interpolation rather than the parcel centroid.
- Never create a customer order, Systemia dispatch, payment entitlement, or verified engineering conclusion from a successful imagery response.
- Production launch remains blocked; both dedicated Stripe links are inactive.

**Next required acceptance:** run the same probe from the actual Evercraft operator host and visually compare the produced site and vicinity images against a known location, noting imagery age, sharpness and offset. No customer data should be used for the initial host check.
