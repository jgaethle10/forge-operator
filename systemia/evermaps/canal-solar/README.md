# EverMaps / Canal Solar Atlas

Research-stage Evercraft pipeline for source-attributed irrigation canal GIS linework. **Not a solar feasibility study or a paid product.**

Tracked mission: https://github.com/jgaethle10/forge-operator/issues/1547

## Run

Python 3.10+, from repository root:

    python -m pip install requests shapely pyproj
    python systemia/evermaps/canal-solar/atlas.py --regions sunnyside_wa turlock_modesto_ca
    python systemia/evermaps/canal-solar/atlas.py --regions all

If retrieval succeeds, each market gets: map.html, canal_segments.geojson, segment_inventory.csv, buyer_brief.html, manifest.json, and *_RESEARCH_ONLY.zip, under systemia/evermaps/canal-solar/out/. Never check generated output into Git. GitHub Actions runs tests and attempts pilots on pull requests. Manual workflow dispatch runs all eleven configured exploratory regions. Workflow research artifacts should not include private commercial assessments.

## Gate definitions

- MAPPED_UNSCREENED: complete source query and nonempty primary geometry. NOT solar feasibility.
- HOLD: incomplete, unavailable or empty query. Stale packages erased; sale/delivery forbidden.
- Only the primary-source line length is reported; cross-source duplications cannot be added.
- Source centerlines may be inactive, piped, drainage or obsolete, and are not complete physical canal censuses.
- Confirm widths, structural clearance, canal operations, ownership/rights, environmental constraints, solar resource, grid and economics with qualified parties before project ranking.
- Source attribution stays with deliveries. Verify licensing and operator permission.
- Paid offers, checkout and outreach require separate human commercial review.

## Data expansion

California DWR local canals (https://publish.data.ca.gov/dataset/i12-canals-and-aqueducts-local) is available under CC BY and excludes major state and federal canals. Add as a separate complementary geometry source only after live data endpoint tests. USBR is partial. The current 11 regions are **configuration targets**, not completed inventories.

No service deployment, automated publication, sending or payments take place in this code.
