import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const clean = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set((values || []).map(clean).filter(Boolean))];

function safeJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function dirs(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function files(root, rel, suffix = '') {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
    .map((entry) => entry.name)
    .sort();
}

const STRATEGIC_LANES = Object.freeze([
  {
    key: 'medical-research',
    name: 'Medical Research Frontier',
    class: 'research_frontier',
    obligation: 'Refresh current biomedical evidence, surface meaningful evidence gaps, and route one bounded research advance with source freshness and uncertainty preserved.'
  },
  {
    key: 'earthquake-intelligence',
    name: 'Earthquake Intelligence',
    class: 'hazard_frontier',
    obligation: 'Refresh authoritative seismic observations, detect material changes, and route map-ready evidence or preparedness/recovery research without overstating risk.'
  },
  {
    key: 'volcano-intelligence',
    name: 'Volcano Intelligence',
    class: 'hazard_frontier',
    obligation: 'Refresh authoritative volcano status/notice evidence, detect elevated-state changes, and route map-ready evidence or research with alert provenance preserved.'
  },
  {
    key: 'evermaps',
    name: 'EverMaps',
    class: 'geospatial_frontier',
    obligation: 'Advance evidence-backed geospatial coverage, layer freshness, or explainability while preserving source lineage and coverage-gap uncertainty.'
  },
  {
    key: 'research-frontier',
    name: 'Research Frontier',
    class: 'research_frontier',
    obligation: 'Select a neglected or weakly evidenced question from the known portfolio and produce one bounded, source-backed next-step artifact or hold receipt.'
  }
]);

function keyFor(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function collectFrontierAssets({ rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const map = new Map();

  const upsert = (rawKey, patch = {}, source = '') => {
    const key = keyFor(rawKey || patch.name);
    if (!key) return;
    const prior = map.get(key) || {
      key,
      name: clean(patch.name) || key,
      class: clean(patch.class) || 'known_surface',
      canonical_url: clean(patch.canonical_url) || null,
      sources: [],
      strategic: false,
      obligation: ''
    };
    map.set(key, {
      ...prior,
      name: prior.name === prior.key && patch.name ? clean(patch.name) : prior.name,
      class: patch.class || prior.class,
      canonical_url: patch.canonical_url || prior.canonical_url,
      strategic: Boolean(prior.strategic || patch.strategic),
      obligation: patch.obligation || prior.obligation,
      sources: unique([...prior.sources, source])
    });
  };

  const directory = safeJson(path.join(root, 'public/.well-known/evercraft-products.json'));
  for (const product of directory?.products || []) {
    upsert(product.product_key || product.name, {
      name: product.name,
      class: product.class || 'public_product',
      canonical_url: product.canonical_url || null
    }, 'public-product-directory');
  }

  for (const name of dirs(root, 'registry')) {
    upsert(name, { name, class: 'registry_surface' }, 'registry');
  }

  for (const name of dirs(root, 'public/chum/products')) {
    upsert(name, { name, class: 'machine_discovery_product' }, 'chum-product-mirror');
  }

  for (const name of dirs(root, 'systemia')) {
    upsert(`systemia-${name}`, {
      name: `Systemia ${name}`,
      class: 'systemia_capability'
    }, 'systemia-module');
  }

  for (const name of files(root, '.github/workflows', '.yml')) {
    upsert(`workflow-${name.replace(/\.ya?ml$/i, '')}`, {
      name: name.replace(/\.ya?ml$/i, ''),
      class: 'operational_workflow'
    }, 'github-workflow');
  }

  for (const lane of STRATEGIC_LANES) {
    upsert(lane.key, { ...lane, strategic: true }, 'mandatory-frontier-lane');
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildFrontierReport({ rootDir = process.cwd(), now = new Date() } = {}) {
  const assets = collectFrontierAssets({ rootDir });
  const obligations = assets.map((asset) => {
    const obligation = asset.obligation ||
      'Verify current evidence and user path, identify the highest-value bounded next edge, execute it when safely autonomous, otherwise emit a specific hold for routing.';
    const body = {
      asset_key: asset.key,
      name: asset.name,
      class: asset.class,
      strategic: asset.strategic,
      canonical_url: asset.canonical_url,
      sources: asset.sources,
      obligation,
      execution_rule: 'advance_or_explicit_hold',
      documentation_rule: 'every-material-advance-must-preserve-lineage-and-institutional-memory',
      publication_rule: 'material-verified-advances-must-route-to-evercraft-clip-or-emit-explicit-publication-hold',
      publication_owner: 'Evercraft Clip',
      publication_states: ['documented_only', 'queued_to_clip', 'published_verified', 'held_with_reason'],
      required_receipts: ['evidence_state', 'next_edge', 'execution_or_hold', 'verification', 'documentation', 'publication_disposition']
    };
    return {
      ...body,
      obligation_key: `frontier:${sha(JSON.stringify(body)).slice(0, 24)}`,
      state: 'admitted'
    };
  });

  const reportBody = {
    schema: 'evercraft.kaidance.frontier-report.v1',
    observed_at: now.toISOString(),
    policy: 'every-known-surface-must-advance-or-emit-explicit-hold',
    documentation_policy: 'everything-is-documented-with-lineage',
    publication_policy: 'material-verified-work-routes-through-evercraft-clip-or-records-an-explicit-hold',
    publication_owner: 'Evercraft Clip',
    asset_count: assets.length,
    strategic_lane_count: assets.filter((x) => x.strategic).length,
    obligation_count: obligations.length,
    silent_drop_count: 0,
    obligations
  };

  const report = {
    ...reportBody,
    receipt_hash: `sha256:${sha(JSON.stringify(reportBody))}`
  };

  const snapshot = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: report.receipt_hash,
    observed_at: now.toISOString(),
    counts: {
      scanned: obligations.length,
      changed: obligations.length,
      admitted: obligations.length,
      held: 0
    },
    evidence_refs: obligations.slice(0, 500).map((x) => x.obligation_key)
  };

  return { report, snapshot };
}

export function writeFrontierArtifacts({
  rootDir = process.cwd(),
  outDir = path.join(rootDir, 'artifacts/portfolio-frontier'),
  now = new Date()
} = {}) {
  const result = buildFrontierReport({ rootDir, now });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(result.report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'mission-snapshot.json'), JSON.stringify(result.snapshot, null, 2) + '\n');
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = writeFrontierArtifacts();
  console.log(JSON.stringify({
    ok: true,
    schema: result.report.schema,
    assets: result.report.asset_count,
    strategic_lanes: result.report.strategic_lane_count,
    obligations: result.report.obligation_count,
    silent_drops: result.report.silent_drop_count,
    receipt_hash: result.report.receipt_hash
  }));
}
