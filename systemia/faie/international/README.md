# FAIE: El Salvador coffee/cooperative evidence pilot
Mission key: `faie-el-salvador-coffee-evidence-pilot-20261115`

**Status: exploratory source discovery only.** This folder is not a running country collector, not a Systemia admission receipt, not an externally verified demo, not a customer record, and not a commercial fulfillment receipt. It does not authorize outbound messages or payment. See the machine-readable, fail-closed source registry `el-salvador-coffee-pilot.v1.json`.

## Commercial thesis
Explore one narrow service for a coffee cooperative or agricultural technology organization in El Salvador: a human-reviewed FAIE evidence brief focused on a **specific operator question**, listing what is documented about soil conditions, water exposure, production resilience and relevant infrastructure, what is unknown, and which records or on-site measurements are needed next. Preserve FAIE's `MODELED`, `REPORTED`, `OBSERVED`, `VERIFIED` distinctions. Do not convert map layers into farm-level measurements or crop-suitability determinations.

The existing Evercraft catalog lists a **$250 FAIE Signal Brief** and **$2,500 Proof Sprint**, but this pilot makes **no offer or checkout claim**: the owned buyer route is held pending payment proof, and the external FAIE AgNormal launch gate failed on November 15, 2026. See [edge recovery #2142](https://github.com/jgaethle10/forge-operator/issues/2142). No sale, partner or live production access is asserted.

## Candidate partners (not contacted or partnered by this repository change)
- **FIAGRO**: agricultural innovation organization; possible discovery/distribution channel. Official site: https://www.fiagro.org/
- **COAUSOLES**: coffee processing/export operator in Ahuachapán; initial question could involve traceability or soil/water evidence for growers. Official site: https://coausoles.com.sv/
- **ACOPACACHI de R.L.**: Chalchuapa coffee cooperative; initial question could involve coffee production resilience and soil/water evidence. Profile: https://www.cesppo.org.sv/acopacachi-de-r-l/

Only individualized, honest, consent-respecting inquiry. Ask *what decision they face* and *what records they can authorize*; do not claim they need FAIE, have given permission, or agreed to pay. A local Spanish-language reviewer should verify translation and scope before commitments. Do not request personal, sensitive, or private farm records without authorization.

## Evidence sources
The official source URLs are cataloged in `el-salvador-coffee-pilot.v1.json` and must be assessed separately for access, licensing, freshness, attribution, scale, coordinate reference systems, map coverage and permitted caching. Examples:
- Salvadoran environmental ArcGIS service documents **organic matter (layer 0), pH (1), texture (2)**. It describes modeled soil mapping, **not** a current field test.
- CENTA digital soil map landing page.
- MAG agricultural maps and statistical publications.
- Banco Central de Reserva geospatial/census portal.

**Do not silently reuse U.S.-only NWS/USGS/NRCS collectors** for El Salvador. Before source activation, add tested country-scoped adapters with provenance, spatial applicability checks, HTTP/timeout/failure states, dataset timestamps, and explicit missing dimensions (not zeros). Never claim current irrigation rights, farm yield, individual creditworthiness, water availability, or regulatory compliance from coarse public layers.

## Sequence and acceptance
1. **Systemia**: admit/dedupe candidate and record the execution authority; Saban specialist review must challenge all relevant dimensions.
2. **FAIE engineering**: verify the exact official endpoints and legal terms, source lineage, units, map projection and time validity. Build separate country adapters with strict provenance and offline fixtures before connecting to runtime.
3. **Owned edge**: independently pass external `/faie/`, `/api/faie/health`, bounded investigation, and `/mcp/faie` checks. Fix #2142 first.
4. **Partner discovery**: obtain an operator's real question through an authorized contact; no claims of partnership without correspondence and consent.
5. **Pilot review**: produce a concise bilingual operator-facing brief, uncertainty table, missing-evidence checklist, and human signoff. Ensure the full source ledger accompanies it.
6. **Commercial verification**: only quote and enable a paid path after payment provider, order ownership, settlement and fulfillment receipts pass. No synthetic revenue claims.

**Success** is one opted-in operator question, a genuinely source-linked and reviewed brief, a delivered receipt, and a real decision on whether to pay for a repeatable service. **Failure** is a brochure, a simulated data result passed off as local evidence, or a guessed revenue number.
