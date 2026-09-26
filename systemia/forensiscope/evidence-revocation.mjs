import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function safeGrantId(value) {
  const grantId = String(value || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(grantId)) {
    throw new Error('ForensiScope evidence grant_id is invalid.');
  }
  return grantId.toLowerCase();
}

function evidenceRef(value) {
  const ref = String(value || '').trim();
  if (!/^forensiscope-evidence:sha256:[a-f0-9]{64}$/.test(ref)) {
    throw new Error('ForensiScope revocation requires a valid evidence_ref.');
  }
  return ref;
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function evidenceRevocationRoot(rootDir = process.cwd()) {
  return path.resolve(
    rootDir,
    'artifacts',
    'forensiscope-access-revocations'
  );
}

function revocationPath(grantId, rootDir) {
  return path.join(
    evidenceRevocationRoot(rootDir),
    digest(safeGrantId(grantId)) + '.json'
  );
}

export function revokeEvidenceGrant({
  grantId,
  evidenceRef,
  reason = 'operator_revoked',
  rootDir = process.cwd()
} = {}) {
  const normalizedGrantId = safeGrantId(grantId);
  const ref = evidenceRef(evidenceRef);
  const body = {
    schema: 'evercraft.forensiscope.evidence-access-revocation.v1',
    grant_id_hash: 'sha256:' + digest(normalizedGrantId),
    evidence_ref: ref,
    reason: String(reason || 'operator_revoked'),
    revoked_at: new Date().toISOString()
  };
  body.revocation_hash = 'sha256:' + digest(JSON.stringify(body));

  const file = revocationPath(normalizedGrantId, rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });

  return body;
}

export function checkEvidenceGrantRevocation({
  grantId,
  evidenceRef,
  rootDir = process.cwd()
} = {}) {
  const normalizedGrantId = safeGrantId(grantId);
  const ref = evidenceRef(evidenceRef);
  const file = revocationPath(normalizedGrantId, rootDir);

  if (!fs.existsSync(file)) {
    return {
      revoked: false,
      evidence_ref: ref,
      grant_id_hash: 'sha256:' + digest(normalizedGrantId)
    };
  }

  const body = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (body.evidence_ref !== ref) {
    throw new Error('ForensiScope revocation evidence ref mismatch.');
  }

  return {
    revoked: true,
    evidence_ref: ref,
    grant_id_hash: body.grant_id_hash,
    reason: body.reason || null,
    revoked_at: body.revoked_at || null,
    revocation_hash: body.revocation_hash || null
  };
}

export function assertEvidenceGrantNotRevoked(options = {}) {
  const state = checkEvidenceGrantRevocation(options);
  if (state.revoked) {
    throw new Error('ForensiScope evidence access grant has been revoked.');
  }
  return state;
}
