import fs from 'node:fs';
import path from 'node:path';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .toLowerCase()
    .replace(/\b(ai|by evercraft)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  const aa = tokens(a);
  const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return overlap / (aa.size + bb.size - overlap);
}

function editDistance(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  const previous = Array.from({ length: bb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= aa.length; i += 1) {
    let corner = previous[0];
    previous[0] = i;
    for (let j = 1; j <= bb.length; j += 1) {
      const upper = previous[j];
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        corner + cost
      );
      corner = upper;
    }
  }
  return previous[bb.length];
}

function similarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const maxLen = Math.max(aa.length, bb.length);
  const edit = maxLen ? 1 - editDistance(aa, bb) / maxLen : 0;
  const token = jaccard(aa, bb);
  const containment =
    aa.includes(bb) || bb.includes(aa)
      ? Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length)
      : 0;
  return Math.max(edit, token, containment);
}

function loadPublicDirectory(rootDir) {
  const file = path.join(rootDir, 'public/.well-known/evercraft-products.json');
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const aliases = [];
  for (const product of payload.products || []) {
    for (const label of [
      product.name,
      product.product_key,
      ...(product.aliases || [])
    ]) {
      if (!label) continue;
      aliases.push({
        label,
        product_key: product.product_key,
        name: product.name,
        canonical_url: product.canonical_url || null
      });
    }
  }
  return aliases;
}

function isPlaceholder(name) {
  const n = normalize(name);
  return (
    !n ||
    /^untitled(?: \d+)?$/.test(n) ||
    /^(test|test app|new app|copy)$/.test(n)
  );
}

function bestPublicMatch(name, publicAliases) {
  let best = null;
  for (const candidate of publicAliases) {
    const score = similarity(name, candidate.label);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best;
}

function classify(raw, publicAliases) {
  const name = String(raw?.name || raw?.title || '').trim();
  if (isPlaceholder(name)) {
    return {
      classification: 'placeholder',
      confidence: 1,
      public_match: null,
      admission_required: false
    };
  }

  if (raw?.visibility === 'internal_only') {
    return {
      classification: 'internal_only_candidate',
      confidence: 1,
      public_match: null,
      admission_required: false
    };
  }

  const match = bestPublicMatch(name, publicAliases);
  if (match?.score === 1) {
    return {
      classification: 'known_public',
      confidence: 1,
      public_match: match,
      admission_required: false
    };
  }

  if (match && match.score >= 0.72) {
    return {
      classification: 'likely_alias',
      confidence: Number(match.score.toFixed(3)),
      public_match: match,
      admission_required: true
    };
  }

  return {
    classification:
      raw?.commercial_candidate === true
        ? 'commercial_candidate'
        : 'needs_review',
    confidence: match ? Number(match.score.toFixed(3)) : 0,
    public_match: match && match.score >= 0.4 ? match : null,
    admission_required: true
  };
}

export async function runAssignment({ assignment, rootDir }) {
  const raw = assignment?.item?.raw || {};
  const publicAliases = loadPublicDirectory(rootDir);
  const result = classify(raw, publicAliases);

  return {
    schema: 'evercraft.saban.portfolio-archaeology-finding.v1',
    status: 'completed',
    agent_id: assignment.agent_id,
    role: assignment.role,
    candidate: {
      name: raw.name || raw.title || null,
      source_record_fingerprint: raw.source_record_fingerprint || null,
      source_identifiers_redacted: raw.source_identifiers_redacted === true
    },
    ...result,
    boundary: {
      inventory_is_not_publication: true,
      source_identifiers_must_remain_redacted: true,
      automatic_publication_allowed: false,
      automatic_checkout_allowed: false
    }
  };
}

export async function reconcile({ results }) {
  const rows = (results || []).filter(Boolean);
  const byName = new Map();
  for (const row of rows) {
    const key = normalize(row.candidate?.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  const duplicateNames = [...byName.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([name, entries]) => ({
      normalized_name: name,
      count: entries.length,
      fingerprints: [...new Set(entries.map((entry) => entry.candidate?.source_record_fingerprint).filter(Boolean))]
    }));

  const representative = [...byName.values()].map((entries) => entries[0]);
  const counts = {};
  for (const row of representative) {
    counts[row.classification] = (counts[row.classification] || 0) + 1;
  }

  const admissionQueue = representative
    .filter((row) => row.admission_required)
    .map((row) => ({
      name: row.candidate?.name || null,
      classification: row.classification,
      confidence: row.confidence,
      possible_public_product_key: row.public_match?.product_key || null,
      reason:
        row.classification === 'likely_alias'
          ? 'Confirm alias relationship before changing public discovery.'
          : 'Candidate needs human/Systemia admission review before any public surface is created.'
    }));

  return {
    schema: 'evercraft.saban.portfolio-archaeology-reconciliation.v1',
    status: 'reconciled',
    unique_candidates: representative.length,
    classification_counts: counts,
    duplicate_name_groups: duplicateNames,
    admission_queue: admissionQueue,
    publication_changes_applied: 0,
    source_identifiers_emitted: false
  };
}
