# Evercraft Research | evidence dossier compiler (v1)

This is the first **usable report-production stage** behind Evercraft Research. It turns an explicit, bounded source/evidence bundle into a readable draft report and cryptographic content digest. It does **not** conduct web research, call agents or models, create a payment, approve a customer deliverable, or send a report.

## Already owned assets it complements

- Public Research front door: `public/research/`, including browser-local intake/download.
- TOWI Evidence-Controlled Research: existing research product discovery/evidence discipline.
- Evercraft Web: existing, separate public fetch and provenance capabilities, with private-target protection.
- Context Fabric: Passport-bound retrieval, evidence states, conflict preservation.
- Systemia/Saban: execution orchestration only after an actual authorized job/receipt.

No duplicate research fetcher or customer-facing dashboard is introduced here.

## Inputs

JSON document: `job_id`, `question`, `as_of`, `sources`, `claims`, `conflicts`, `next_steps`.

Each source includes a declared ID, public URL, title, capture timestamp, source snapshot text and optional original SHA-256 digest. The compiler **recalculates** SHA-256 over the exact supplied UTF-8 snapshot text, without trimming or Unicode normalization. If a collector hashes different byte content, the receipt must not be accepted. User-supplied source records remain `supplied_snapshot_unverified`, even when a purported receipt exists.

An authorized caller may inject a `verifyCaptureReceipt` function that independently checks an owned collection receipt against the exact URL, timestamp and content digest. Only that strict callback can change a source to `collector_receipt_verified`. A verified capture confirms **which bytes were captured**, not that the content is correct.

Every claim carries `evidence_state`, `basis`, source IDs, confidence, and explicit assumptions for modeled/inferred statements. `observed`/`public` are **rejected** unless all referenced source snapshots have independently verified capture receipts. Unsupported `high` confidence fails. Conflicting claims remain side by side.

## Local operator usage

```bash
node systemia/research-service/compile.mjs --input /private/research-job.json --out /private/research-output
node --test tests/evercraft-research-evidence-dossier.test.mjs tests/evercraft-research-compile.test.mjs
```

The output folder must be private, never inside a `public` directory. It contains `evidence-dossier.review-draft.md` and `evidence-dossier.review-draft.json`. The writer uses create-only output, so repeating a write cannot accidentally replace an earlier research record. No source data is printed to logs.

The Markdown output has explicit claim-level evidence, source ledger, content hashes, contradiction review, unknowns, and follow-up work. The machine receipt includes `report_status=draft_needs_human_review`, `payment_verified=false`, `delivery_authorized=false`, plus SHA-256 of the exact report text.

## Commercial completion gates still missing

1. Verified external HTTPS route to the Research front door. Current GitHub source alone does not prove that Pages is reachable.
2. A lawful, authenticated customer intake and permissioned source collection route, reusing Evercraft Web rather than embedding secrets in the browser.
3. Real research job creation only following a matching approved Evercraft Payments order and an authoritative provider-paid receipt.
4. A real collector receipt verifier wired into the dossier compiler. A test stub is not production evidence.
5. Cross-source verification and editorial work that produces genuine evidence-supported findings; this compiler deliberately does **not** hallucinate findings.
6. A governed independent human QA/release authorization, rendering and secure customer delivery with receipt.
7. Audited unit costs, approved pricing, approved Research SKU, and measurable buyer demand.

**No sale, independent research run, payment or customer fulfillment is claimed by this source release.**


## Watershed Intelligence | Yakima Basin research slice

`watershed-intelligence.mjs` is a bounded **research-only** reader and snapshot compiler. It does not create Sentinel incidents, operate drones, publish customer reports, initiate payments, or activate a resident scheduler. Reuses Sentinel's existing USGS Water Data observation adapter but keeps basin intelligence outside its life-safety event engine.

**Data sources:** NRCS AWDB `/services/v1/data` for requested Washington SNOTEL/SNOLITE daily WTEQ (snow-water equivalent) and SNWD (snow depth); USGS modern Water Data latest-continuous via the existing Sentinel adapter for river discharge and gage height. Station IDs must be independently verified from official station directories before live runs. The supplied `yakima-basin-wa` Sentinel profile already records four USGS river locations; **no SNOTEL station is asserted as verified by this change**.

**Collector entry point:** `collectYakimaWatershed({ asOf, snowStationIds, riverLocationIds })`. Explicit lists are mandatory for the relevant source to be queried. Returns a source-scoped, non-publishing snapshot with records, freshness flags, holds and failure receipts. `fetchImpl` can be injected for fixture tests. The collector uses bounded date windows and fixed official HTTPS hosts. No ambient environment secrets or customer input are sent to data providers.

**Truth rules:** Missing is never zero. USGS provisional observations remain `observed` rather than `verified`. Late readings become `stale`. No percent-of-normal is calculated without same-date official climatological normals and a documented basin aggregation method, especially in October when normal SWE is small. Reservoir data remains `not_verified` until a separate USBR ingestion/validation adapter exists. No seasonal supply forecast is inferred. Source failures return explicit `partial` results, never healthy readings.

**Fixture gate:** `npm run test:watershed-intelligence`, also included in `npm run check`. Fixture passes do not prove live NRCS reachability, continuous deployment or customer suitability.

**Next independent release gates:** Verify an actual Yakima NRCS station set; run and receipt a live AWDB fetch; validate USBR daily reservoir data and its units/time semantics; add matched official SWE normals and denominator-stability handling; independently verify the claims in a human-reviewed brief before any public claims or commercial offering. The autonomous drone-navigation research lane remains separate and has no flight authorization in this module.
