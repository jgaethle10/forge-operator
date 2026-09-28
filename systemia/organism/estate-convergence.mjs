#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sanitizePrivateInventoryRows } from '../saban/private-inventory.mjs';
import { runAssignment, reconcile } from '../saban/portfolio-archaeology-adapter.mjs';

const rootDir = process.cwd();
const snapshotPath = process.argv[2] || 'systemia/saban/estate-inventory.snapshot.json';
const outputPath = process.argv[3] || 'artifacts/portfolio-sentinel/estate-convergence.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function publishedMcpCount(conformance) {
  return (conformance.products || []).filter((product) => {
    const state = String(product?.mcp_registry?.publication_state || '').toLowerCase();
    return state.startsWith('published');
  }).length;
}

const snapshot = readJson(snapshotPath);
const rows = sanitizePrivateInventoryRows(
  (snapshot.apps || []).map((app) => ({ kind: 'base44_app', raw: { name: app.name } })),
  { expose_source_path: false }
);

const results = [];
for (let index = 0; index < rows.length; index += 1) {
  results.push(await runAssignment({
    assignment: {
      agent_id: `estate-${String(index + 1).padStart(4, '0')}`,
      role: 'portfolio_archaeology',
      item: rows[index]
    },
    rootDir
  }));
}

const archaeology = await reconcile({ results });
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const registry = readJson('registry/catalog.json');

const counts = archaeology.classification_counts || {};
const placeholders = Number(counts.placeholder || 0);
const namedNonPlaceholder = Math.max(0, rows.length - placeholders);
const knownPublic = Number(counts.known_public || 0);
const likelyAlias = Number(counts.likely_alias || 0);
const needsReview = Number(counts.needs_review || 0);
const commercialCandidates = Number(counts.commercial_candidate || 0);
const internalCandidates = Number(counts.internal_only_candidate || 0);

const report = {
  schema: 'evercraft.portfolio-estate-convergence.v1',
  observed_on: snapshot.captured_on || null,
  purpose: 'Keep raw software-estate inventory separate from public-product, conformance, registry and MCP-publication counts so a downstream subset is never mistaken for the whole estate.',
  doctrine: {
    inventory_is_not_publication: true,
    no_single_product_count_collapses_layers: true,
    automatic_publication_allowed: false,
    public_admission_requires_review: true,
    source_identifiers_persisted: false
  },
  summary: {
    estate_snapshot_items: rows.length,
    estate_snapshot_complete_claim: snapshot.coverage?.complete_estate_claim === true,
    estate_snapshot_connector_limit: snapshot.coverage?.requested_limit || null,
    estate_named_non_placeholder: namedNonPlaceholder,
    exact_known_public_matches: knownPublic,
    likely_aliases_requiring_review: likelyAlias,
    needs_review: needsReview,
    commercial_candidates: commercialCandidates,
    internal_only_candidates: internalCandidates,
    placeholders,
    public_product_directory: (directory.products || []).length,
    conformance_products: (conformance.products || []).length,
    central_registry_products: (registry.products || []).length,
    mcp_registry_published: publishedMcpCount(conformance),
    admission_queue: (archaeology.admission_queue || []).length,
    exact_public_match_rate: namedNonPlaceholder
      ? Number((knownPublic / namedNonPlaceholder).toFixed(4))
      : 0
  },
  layers: {
    observed_estate_snapshot: 'Apps/builds observed in the privacy-safe inventory snapshot. This is not a full-estate count unless the source explicitly proves complete coverage.',
    public_product_directory: 'Products explicitly admitted for public discovery.',
    conformance_products: 'Products represented in the stricter cross-LLM conformance registry.',
    central_registry_products: 'Products represented in the central machine routing catalog.',
    mcp_registry_published: 'Products with receipt-backed published MCP Registry state.'
  },
  reconciliation: archaeology,
  admission_queue: archaeology.admission_queue || [],
  boundary: 'This report may identify candidates and likely aliases. Snapshot size is not a full-estate count unless complete source coverage is proven. The report never grants public publication, payment authority, or external distribution by itself.'
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, output: outputPath, summary: report.summary }));
