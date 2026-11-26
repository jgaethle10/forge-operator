# Federal address-to-aerial preview · Evercraft Site Planner

Status: **private, screening-only integration behind the existing loopback operator service**. The public customer product remains closed; commercial quote orders, payments and Systemia dispatch remain held.

## Three-step operator flow

1. Enter a complete mainland-U.S. property address and click **Find public aerial**, or upload an authorized image instead.
2. Inspect the matched address and imagery. Tap the aerial to place **conceptual chargers**. No automatic parcel boundary or stall-detection claim.
3. View / save the two-sheet drawing. Advanced equipment, route, evidence and calibration tools stay optional.

This follows the simple default path without an additional account, GIS settings page or complex wizard.

## Explicit public data contracts

- **U.S. Census Geocoding Services API:** https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html  
  Exact origin `https://geocoding.geo.census.gov`, route `/geocoder/locations/onelineaddress`, benchmark `Public_AR_Current`, JSON response. Only a **single unambiguous match** is accepted; an address-range coordinate does not establish parcel geometry, driveway location or ownership.
- **USGS The National Map: USGS Imagery Only:** https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer  
  Exact origin `https://basemap.nationalmap.gov`, route `/arcgis/rest/services/USGSImageryOnly/MapServer/export`, EPSG:3857, JPEG, fixed 1024×752 outputs. A small vicinity and a broader area image are requested around the Census matched coordinate. Service resolution, vintage and source coverage vary.

No arbitrary URL, provider selection, arbitrary lat/lon, external iframe, remote user credentials or dynamic public hosting is accepted. Outbound requests are HTTPS with 10-second timeouts, redirects disabled, and bounded response sizes. Only the mainland U.S. is enabled in this initial mode. The output is marked as an estimated address point plus source-backed imagery **for screening**.

An operator clicking **Find public aerial** consents to sending the typed address to the Census service and approximate location to USGS. No customer record, project order, payment, or Systemia outbox item is created by the lookup. No evidence of a real parcel match is inferred merely because the image appears plausible.

## Image and project provenance

The server returns two JPEG images with SHA-256 digests, map-envelope coordinates and provider references. The browser uses those exact bytes, records source hashes in evidence JSON, and labels date/parcel verification as **not established**. The saved draft is still source-bound and requires re-uploading the same image bytes before restoring. Download the two source JPGs using **More tools & project details → Save source photos for later**, then keep them with the draft JSON.

A newly loaded manual or government site image clears all previous site symbols, routes, measurements **and old vicinity imagery** to prevent cross-property carryover. If either upstream fails, no imagery is applied and the operator can upload an image manually.

## Test and release boundaries

```sh
cd products/site-planner
python3 -m unittest discover -v
```

`test_aerial_sources.py` uses strictly mocked Census/USGS responses for success, ambiguity, redirected/malformed/oversized responses, unsupported locations, authentication, and read-only HTTP behavior. `test_aerial_ui.py` exercises the browser action with a mocked response and checks failure isolation, source attribution and manual replacement.

**Not yet proven:** real external-service success on the intended Evercraft host, imagery suitability for a particular site, geocoded parking lot alignment, official parcel boundaries, current utility records, legally reviewed source use, or accredited engineering. An official image does not guarantee current site condition or accuracy sufficient to design parking spaces. Do not issue paid or construction documents without licensed engineering review as appropriate.

Design deliberately remains **Evercraft-owned**, with published government data as upstream input, not a third-party application runtime.
