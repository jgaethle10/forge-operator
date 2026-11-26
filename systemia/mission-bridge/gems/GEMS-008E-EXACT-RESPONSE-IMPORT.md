# GEMS-008E | DNS-isolated Work environment: exact-response import

**Purpose:** Continue the existing, otherwise unchanged **GEMS-008D** NBMG NGDS ActiveFault metadata-only audit when the original Work compute environment cannot resolve `web2.nbmg.unr.edu`. This is a **transport-only adaptation**, not a new geological dataset/method, new competition submission, or fresh evaluation. GitHub issue #2260 records the true GEMS-008D blocker: `socket.gaierror [Errno -3] Temporary failure in name resolution` raised before any HTTP response. The PDF, manifest, earlier archived data and GEMS-001 selection remain untouched. GEMS-008D private failed-attempt archive SHA256: `a85a8f5b1b29bc211c6ba7c27019f0daca7938226aa467c518240928f46f1767`. Its blocked receipt SHA256: `ea609807680f548814b6c07ff6b69df61dd137291b9a2e931cced8ab7724f5db`.

**Independent service context:** Public web readers can access an indexed NBMG `NV_Data/NVActiveFaults/MapServer/0` human-readable layer description (polyline, source and positional accuracy fields, max 1000 records). The `?f=pjson` service response and **actual feature results were NOT fetched successfully by this chat**. Published page access does not establish live query accessibility from the private Work compute runtime. This is an NGDS historical compilation, **NOT** the Petrified Spring 2020 fault GIS nor the dead OneGeology 2013 1:24k service. Existing older sources may derive from QFault/INGENIOUS and are not independent ground truth.

## Minimal execution flow in ORIGINAL PRIVATE Work thread

1. **Prefer a different already-authorized research runtime with normal outbound DNS** (existing owned Penguin/NextGen, or an explicitly authorized Work browser with network access), not DNS hacks, hostname/IP overrides, insecure TLS, new source endpoints, global proxy settings, or arbitrarily larger queries. Do not replicate private originals into unapproved systems.

2. In the original Work private environment, first run the **unchanged** GEMS-008D offline plan mode with the exact hash-pinned original manifest and Petrified Spring PDF. It **does not contact NBMG**. Use a NEW private output path:

```bash
cd systemia/mission-bridge/gems
python3 gems_008d_nbmg_activefault_probe.py \
  --manifest /PRIVATE/GEMS008B/manifest.json \
  --pdf /PRIVATE/GEMS008B/OF2020-01_sheet1.pdf \
  --receipt /PRIVATE/NEW/GEMS008E_FROZEN_URL_PLAN.json
```

The file contains precisely two URLs: `service_metadata_url` (official NBMG layer `?f=json`) and `query_url` (the original bounded EPSG:26911 envelope, `returnGeometry=false`, 100 requested records, fixed 7 public source/accuracy fields). Never publish the private query URL or its geographic envelope to GitHub/social channels. The bounded URL must be **copied verbatim**, not constructed from memory. Normal official HTTPS query will necessarily disclose the local map footprint to the intended public NBMG host.

3. Use the authorized network-capable environment/browser to perform **only these two GET requests in order**. The layer metadata must return HTTP 200 and true JSON with `type=Feature Layer`, `geometryType=esriGeometryPolyline` and all required source fields. Do **not** send the records query if layer metadata is invalid. Use normal HTTPS certificate validation; do not follow redirects. Keep the original JSON responses locally in private Work evidence. No third-party arbitrary URL scraper, no private rasters or original sampled fault labels transferred.

4. Save each actual response with the following **browser capture envelope**, exactly one per request (e.g., `layer-capture.json` and `query-capture.json`), in a new private evidence folder. Use actual values for status, content type, timestamp, and redirects, with no fabricated attestations. `response` is the complete raw JSON response parsed as a JSON object:

```json
{
  "schema":"evercraft.gems.public-arcgis-browser-capture.v1",
  "method":"GET",
  "requested_url":"EXACT ORIGINAL FROZEN URL FROM THE PRIVATE GEMS008E PLAN",
  "http_status":200,
  "redirects_followed":false,
  "content_type":"application/json",
  "captured_at_utc":"YYYY-MM-DDTHH:MM:SSZ",
  "response":{"THE ACTUAL COMPLETE ARCGIS JSON RESPONSE":"HERE"}
}
```

This capture format only permits receipt validation; **a local file claiming HTTP 200 is not itself cryptographic proof that the server returned it**. Preserve the browser's actual HTTP/TLS provenance logs separately. Never fill a placeholder as a source claim.

5. Checkout reviewed GitHub code and run all new offline importer synthetic regressions, then **import the two exact captures** using `gems_008e_nbmg_response_import.py` with unchanged pinned private inputs:

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_008e_nbmg_response_import.py
python3 gems_008e_nbmg_response_import.py \
  --manifest /PRIVATE/GEMS008B/manifest.json \
  --pdf /PRIVATE/GEMS008B/OF2020-01_sheet1.pdf \
  --layer-capture /PRIVATE/NEW/GEMS008E/layer-capture.json \
  --query-capture /PRIVATE/NEW/GEMS008E/query-capture.json \
  --receipt /PRIVATE/NEW/GEMS008E_Aggregate_Source_Receipt.json
```

The script recomputes exact source hashes/URL plan and refuses captures with a changed URL/envelope, larger than the fixed byte budget, non-200 status, redirect, ArcGIS `error` object, truncated/malformed/duplicate features, changed expected source field schema, any returned feature geometry, or the original 100-record limit reached. It writes only **aggregate distributions and SHA-256 evidence receipts**, not private coordinates, URLs, feature IDs or raw source objects. As before, it refuses to claim independent data or competition authorization.

6. If the network-capable source still fails DNS, if raw JSON cannot be saved, or if the exact request returns an error or too many records, mark **BLOCKED**. Do not silently switch to a different fault service, widen sample envelope, ignore TLS, or invent a successful feature audit. Preserve a new blocked-attempt log. Any genuinely new source/method requires its own separately approved research gate.

7. Return only actual **fault source/reference, name, observation method, accuracy and type distributions**, if retrieved. Show whether any source points to an original map that warrants source-by-source lineage inspection. The 2013 NGDS data cannot be assumed to include Petrified Spring 2020, and QFault/INGENIOUS derivative records are not independent validation. Preserve original private archives and GEMS-001 #330339 selected official public DTI 0.0552. No models, candidate TIFFs, submission, money spending or sharing private organizer rasters.

**Evidence distinction:** A DNS failure is infrastructure-only; a successful metadata response is a *source lead*; a novel fault dataset requires verified geometry + source lineage + usage rights + original GeoDAWN mask overlap + proper preregistered evaluation. None is interchangeable.
