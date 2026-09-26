import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  return 'sha256:' + crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function sanitizedArgs(args = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (/token|secret|authorization/i.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export function evidenceAuditPath(rootDir = process.cwd()) {
  return path.resolve(
    rootDir,
    'artifacts',
    'forensiscope-audit',
    'evidence-access.jsonl'
  );
}

export function recordEvidenceAccessAudit({
  rootDir = process.cwd(),
  tool,
  evidenceRefs = [],
  subjects = [],
  scopes = [],
  args = {},
  result = null
} = {}) {
  const at = new Date().toISOString();
  const eventId = 'forensiscope-audit-' + crypto.randomBytes(12).toString('hex');
  const body = {
    schema: 'evercraft.forensiscope.evidence-access-audit.v1',
    event_id: eventId,
    at,
    tool: String(tool || ''),
    evidence_refs: [...new Set((evidenceRefs || []).map(String))].sort(),
    subjects: [...new Set((subjects || []).filter(Boolean).map(String))].sort(),
    scopes: [...new Set((scopes || []).filter(Boolean).map(String))].sort(),
    request_digest: digest(sanitizedArgs(args)),
    result_schema: result?.schema || null,
    result_digest: digest(result),
    privacy: {
      raw_media_logged: false,
      transcript_text_logged: false,
      query_text_logged: false,
      access_token_logged: false
    }
  };
  const receipt = {
    ...body,
    event_hash: digest(body)
  };

  const file = evidenceAuditPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(receipt) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'a'
  });

  return {
    schema: receipt.schema,
    event_id: receipt.event_id,
    at: receipt.at,
    event_hash: receipt.event_hash,
    request_digest: receipt.request_digest,
    result_digest: receipt.result_digest
  };
}
