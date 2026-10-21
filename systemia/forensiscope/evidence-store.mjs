import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REF_PREFIX = 'forensiscope-evidence:sha256:';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function digestGraph(graph) {
  return crypto.createHash('sha256').update(canonicalJson(graph)).digest('hex');
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.tmp-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function parseEvidenceRef(ref) {
  const text = String(ref || '');
  if (!text.startsWith(REF_PREFIX)) throw new Error('Invalid ForensiScope evidence ref.');
  const digest = text.slice(REF_PREFIX.length);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid ForensiScope evidence digest.');
  return digest;
}

export function evidenceStoreRoot(rootDir = process.cwd()) {
  return path.resolve(rootDir, 'artifacts/forensiscope-results');
}

export function persistEvidenceGraph(graph, {
  rootDir = process.cwd()
} = {}) {
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('Only completed ForensiScope evidence graphs may be persisted.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(graph.source_sha256 || ''))) {
    throw new Error('ForensiScope evidence graph is missing a valid source SHA-256.');
  }

  const digest = digestGraph(graph);
  const ref = REF_PREFIX + digest;
  const root = evidenceStoreRoot(rootDir);
  const dir = path.join(root, digest);
  const graphFile = path.join(dir, 'evidence-graph.json');
  const manifestFile = path.join(dir, 'manifest.json');
  const graphPayload = JSON.stringify(graph, null, 2) + '\n';

  if (fs.existsSync(graphFile)) {
    const existing = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
    if (digestGraph(existing) !== digest) {
      throw new Error('Existing ForensiScope evidence graph failed digest verification.');
    }
  } else {
    atomicWrite(graphFile, graphPayload);
  }

  const manifest = {
    schema: 'evercraft.forensiscope.evidence-reference.v1',
    evidence_ref: ref,
    graph_digest: 'sha256:' + digest,
    source_sha256: graph.source_sha256,
    graph_schema: graph.schema,
    node_count: Number(graph.node_count || graph.nodes?.length || 0),
    edge_count: Number(graph.edge_count || graph.edges?.length || 0)
  };
  atomicWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

  return manifest;
}

export function loadEvidenceGraph(evidenceRef, {
  rootDir = process.cwd()
} = {}) {
  const digest = parseEvidenceRef(evidenceRef);
  const graphFile = path.join(evidenceStoreRoot(rootDir), digest, 'evidence-graph.json');
  if (!fs.existsSync(graphFile)) throw new Error('ForensiScope evidence ref was not found.');

  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
  if (graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('Stored ForensiScope evidence graph has the wrong schema.');
  }
  const observed = digestGraph(graph);
  if (observed !== digest) {
    throw new Error('Stored ForensiScope evidence graph failed digest verification.');
  }

  return {
    evidence_ref: REF_PREFIX + digest,
    graph_digest: 'sha256:' + digest,
    graph
  };
}

export function verifyEvidenceRef(evidenceRef, options = {}) {
  const loaded = loadEvidenceGraph(evidenceRef, options);
  return {
    schema: 'evercraft.forensiscope.evidence-reference-verification.v1',
    evidence_ref: loaded.evidence_ref,
    graph_digest: loaded.graph_digest,
    source_sha256: loaded.graph.source_sha256,
    verified: true
  };
}
