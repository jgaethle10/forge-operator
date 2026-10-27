# EverMaps | Mineral Intelligence: Washington aggregate screening v1

**Owner:** Evercraft LLC. **State:** research adapter, not production or a paid service.

The first adapter pulls WGS aggregate Resource Areas (polygon layer 11), preserves the publisher's classifications, writes a map-ready GeoJSON, and produces a research-review queue. It does not discover ore or determine which properties can be mined.

## Official source

- Washington Geological Survey, Digital Data Series 31, version 3.0, July 2026.
- Layer: https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Aggregate_Resources/FeatureServer/11
- Original classes: Demonstrated, Inferred, Speculative, Not a Resource and Not Analyzed.
- Publisher says the polygons generally should be used at no finer than 1:24,000, not for parcel-specific certainty.
- Source fields include commodity, reported acreage, thickness class, year and county.

## Reproduction

From the repository root, run:

    node --test systemia/evermaps/mineral-intelligence.test.mjs
    node systemia/evermaps/mineral-intelligence-cli.mjs Yakima ./yakima-aggregate

The second command reads the public WGS endpoint and writes yakima-aggregate.screen.json and yakima-aggregate.geojson. It requires network access; no private credentials. A non-complete page count must be treated as an incomplete dataset, never as proof of absence.

## Truth contract

- Observed: WGS's published resource polygons, classification, and attributes.
- Not verified: mineral ownership and claims, legal access, drilling, grade, permit feasibility, road access, environmental approvals, or project economics.
- Sorting a review queue by WGS classification is **not** a discovery-probability ranking, resource-volume estimate or investment recommendation.
- Unknown classification, absent geometry, and incomplete source coverage remain explicit. Missing is not zero.
- Human signoff required before consequential real-world decisions.

## Follow-on integration gates

1. Run a live WGS county ingestion with provenance receipt, completeness and feature-quality audit.
2. Integrate BLM MLRS mining claims as a **separate legal-history layer**. Carry through its mapping-quality and geocoding caveats: https://nlsdbpubgis.blm.gov/arcgis/rest/services/Mining_Claims/MiningClaims/MapServer
3. Combine county land-use ordinances, floodplains, protected areas, parcel title research, transport, material testing and demand economics.
4. Wire EverMaps geospatial UI with Systemia source health and durable provenance.
5. Pilot with an actual aggregate operator and qualified geologist before paid site screening.

No production deployment, customer deliverable, mineral title certification or live viability claim is authorized by this branch.
