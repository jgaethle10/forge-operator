import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evidenceStoreRoot } from './evidence-store.mjs';

const PROVENANCE_PREFIX = 'forensiscope-provenance:sha256:';
const EVIDENCE_PREFIX = 'forensiscope-evidence:sha256:';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function evidenceDigest(evidenceRef) {
  const ref = String(evidenceRef || '');
  if (!ref.startsWith(EVIDENCE_PREFIX)) {
    throw new Error('ForensiScope provenance requires a valid evidence_ref.');
  }
  const value = ref.slice(EVIDENCE_PREFIX.length);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('ForensiScope provenance evidence digest is invalid.');
  }
  return value;
}

function provenanceDigest(provenanceRef) {
  const ref = String(provenanceRef || '');
  if (!ref.startsWith(PROVENANCE_PREFIX)) {
    throw new Error('Invalid ForensiScope provenance ref.');
  }
  const value = ref.slice(PROVENANCE_PREFIX.length);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid ForensiScope provenance digest.');
  }
  return value;
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.tmp-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function engineIds(graph) {
  return [...new Set(
    (graph.nodes || [])
      .filter((node) => node.kind === 'transcript_segment')
      .map((node) => node.engine_id)
      .filter(Boolean)
      .map(String)
  )].sort();
}

export function buildForensiScopeProvenance({
  analysisReceipt,
  graph
} = {}) {
  if (
    !analysisReceipt ||
    analysisReceipt.schema !== 'evercraft.forensiscope.analysis-receipt.v1' ||
    analysisReceipt.status !== 'ready'
  ) {
    throw new Error('ForensiScope provenance requires a ready analysis receipt.');
  }
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('ForensiScope provenance requires a completed evidence graph.');
  }

  const evidenceRef = String(analysisReceipt.result?.evidence_ref || '');
  evidenceDigest(evidenceRef);

  return {
    schema: 'evercraft.forensiscope.analysis-provenance.v1',
    evidence_ref: evidenceRef,
    source_sha256: analysisReceipt.source?.sha256 || null,
    evidence_graph_digest:
      analysisReceipt.result?.evidence_graph_digest || null,
    job_id: analysisReceipt.job_id || null,
    execution: {
      fabric: analysisReceipt.execution?.execution_fabric || null,
      results_digest: analysisReceipt.execution?.results_digest || null,
      quality_status: analysisReceipt.execution?.quality?.status || null,
      logical_agents: Number(analysisReceipt.execution?.logical_agents || 0),
      physical_workers: Number(analysisReceipt.execution?.physical_workers || 0)
    },
    engines: {
      transcription_engine_ids: engineIds(graph),
      semantic: {
        state: graph.semantic_index?.state || 'not_available',
        engine_id: graph.semantic_index?.engine_id || null,
        dimensions: Number(graph.semantic_index?.dimensions || 0),
        entry_count: Number(graph.semantic_index?.entry_count || 0)
      }
    },
    evidence: {
      node_count: Number(graph.node_count || graph.nodes?.length || 0),
      edge_count: Number(graph.edge_count || graph.edges?.length || 0),
      comparison_samples: Number(
        graph.comparison_index?.perceptual_sample_count || 0
      )
    },
    integrity: {
      source_identity_hash_based: true,
      source_integrity_preserved:
        analysisReceipt.truth_boundary?.source_integrity_preserved === true,
      evidence_graph_content_addressed: true
    },
    privacy: {
      source_path_included: false,
      raw_media_included: false,
      transcript_text_included: false,
      authorization_actor_included: false,
      access_token_included: false
    }
  };
}

export function persistForensiScopeProvenance({
  analysisReceipt,
  graph,
  rootDir = process.cwd()
} = {}) {
  const body = buildForensiScopeProvenance({ analysisReceipt, graph });
  const provenanceHash = digest(body);
  const evidenceHash = evidenceDigest(body.evidence_ref);
  const provenanceRef = PROVENANCE_PREFIX + provenanceHash;
  const file = path.join(
    evidenceStoreRoot(rootDir),
    evidenceHash,
    'provenance',
    provenanceHash + '.json'
  );
  const payload = {
    ...body,
    provenance_ref: provenanceRef,
    provenance_digest: 'sha256:' + provenanceHash
  };

  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    const existingBody = { ...existing };
    delete existingBody.provenance_ref;
    delete existingBody.provenance_digest;
    if (digest(existingBody) !== provenanceHash) {
      throw new Error('Stored ForensiScope provenance failed digest verification.');
    }
  } else {
    atomicWrite(file, JSON.stringify(payload, null, 2) + '\n');
  }

  return payload;
}

export function loadForensiScopeProvenance({
  evidenceRef,
  provenanceRef,
  rootDir = process.cwd()
} = {}) {
  const evidenceHash = evidenceDigest(evidenceRef);
  const provenanceHash = provenanceDigest(provenanceRef);
  const file = path.join(
    evidenceStoreRoot(rootDir),
    evidenceHash,
    'provenance',
    provenanceHash + '.json'
  );
  if (!fs.existsSync(file)) {
    throw new Error('ForensiScope provenance ref was not found.');
  }

  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const body = { ...payload };
  delete body.provenance_ref;
  delete body.provenance_digest;

  if (digest(body) !== provenanceHash) {
    throw new Error('Stored ForensiScope provenance failed digest verification.');
  }
  if (payload.evidence_ref !== evidenceRef) {
    throw new Error('ForensiScope provenance does not match this evidence ref.');
  }

  return {
    ...payload,
    verified: true
  };
}
