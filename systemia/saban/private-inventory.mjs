import crypto from 'node:crypto';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim();
}

function stableFingerprint(value) {
  return 'sha256:' + crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function safeKey(value, fallback) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

const SAFE_FIELDS = new Set([
  'name',
  'title',
  'description',
  'summary',
  'kind',
  'category',
  'visibility',
  'lifecycle',
  'commercial_candidate',
  'tags',
  'aliases'
]);

export function sanitizePrivateInventoryRow(row, index = 0, privacy = {}) {
  const source = row?.raw || row || {};
  const redacted = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_FIELDS.has(key)) continue;
    redacted[key] = value;
  }

  const name = normalizeText(
    redacted.name ||
    redacted.title ||
    row?.name ||
    row?.title ||
    ''
  );

  const fingerprint = stableFingerprint(source);
  const key = safeKey(name, `inventory-${index + 1}`);

  return {
    kind: row?.kind || 'external_inventory',
    key,
    source_file: privacy.expose_source_path === true ? privacy.source_file || null : null,
    raw: {
      ...redacted,
      name,
      source_record_fingerprint: fingerprint,
      source_identifiers_redacted: true
    }
  };
}

export function sanitizePrivateInventoryRows(rows, privacy = {}) {
  return (rows || [])
    .filter(Boolean)
    .map((row, index) => sanitizePrivateInventoryRow(row, index, privacy));
}
