#!/usr/bin/env node
// Evercraft artifact custody: local manifest + independent signed-receipt verification.
// Offline, read-only with respect to artifacts; never uploads, deploys, installs or publishes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, verify as verifySignature } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'evercraft.artifact.manifest.v1';
export const RECEIPT_SCHEMA = 'evercraft.artifact.attestation.v1';
export const STAGES = Object.freeze(['backup_roundtrip', 'git_commit', 'device_install', 'publication']);
const IGNORE_PARTS = new Set(['.git', 'node_modules', '.next', 'dist', '__pycache__']);
const SENSITIVE = /(^|\/)(\.env(?:\..*)?|id_(?:rsa|ed25519)|.*\.(?:pem|p12|pfx|key)|credentials(?:\.json)?|secrets?(?:\..*)?)$/i;
const SHA = /^[a-f0-9]{64}$/;

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function fail(message) { throw new Error(message); }
function relativeSafe(p) {
  if (typeof p !== 'string' || p.length === 0 || p.includes('\\') || path.posix.isAbsolute(p) || p.split('/').some(s => !s || s === '.' || s === '..')) fail('unsafe artifact path');
  return p;
}
function realRoot(p) { const r = fs.realpathSync(p); if (!fs.statSync(r).isDirectory()) fail('root is not a directory'); return r; }
function safeFile(root, rel) {
  relativeSafe(rel);
  const candidate = path.resolve(root, rel);
  if (!(candidate.startsWith(root + path.sep))) fail('artifact escapes root');
  // Explicitly reject links, including symlinked parent directories.
  let current = root;
  for (const seg of rel.split('/')) {
    current = path.join(current, seg);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('symlink not admitted');
  }
  if (!fs.statSync(candidate).isFile()) fail('not a regular file');
  return candidate;
}
function walk(root, current = '', files = []) {
  for (const item of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
    const rel = current ? `${current}/${item.name}` : item.name;
    if (IGNORE_PARTS.has(item.name) || SENSITIVE.test(rel) || item.isSymbolicLink()) continue;
    if (item.isDirectory()) walk(root, rel, files);
    else if (item.isFile()) files.push(rel);
  }
  return files;
}
export function prepare({ root, project, version, exclude = [] }) {
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(project || '')) fail('project must be a safe slug');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(version || '')) fail('invalid version');
  root = realRoot(root);
  const excluded = new Set(exclude);
  const files = walk(root).filter(p => !excluded.has(p)).sort();
  if (!files.length) fail('no admissible artifact files');
  return { schema: SCHEMA, project, version, generated_at_utc: new Date().toISOString(),
    artifacts: files.map(p => { const file = safeFile(root, p); const bytes = fs.readFileSync(file);
      return { path: p, size_bytes: bytes.length, sha256: sha(bytes) }; }) };
}
export function validateManifest(m) {
  if (!m || m.schema !== SCHEMA || !Array.isArray(m.artifacts) || !m.artifacts.length) fail('invalid manifest');
  const seen = new Set();
  for (const a of m.artifacts) {
    relativeSafe(a.path);
    if (seen.has(a.path) || !Number.isSafeInteger(a.size_bytes) || a.size_bytes < 0 || !SHA.test(a.sha256)) fail('invalid or duplicate artifact entry');
    seen.add(a.path);
  }
  return m;
}
// Claims are exactly these fields, in this order. Signature is base64 Ed25519 over their UTF-8 JSON.
export function canonicalClaims(r) {
  return JSON.stringify({ schema: r.schema, issuer: r.issuer, stage: r.stage,
    artifact_sha256: r.artifact_sha256, artifact_path: r.artifact_path,
    observed_at_utc: r.observed_at_utc, evidence_id: r.evidence_id });
}
export function verifyAttestation(r, truststore) {
  if (!r || r.schema !== RECEIPT_SCHEMA || !STAGES.includes(r.stage) || typeof r.issuer !== 'string' ||
    !SHA.test(r.artifact_sha256 || '') || typeof r.artifact_path !== 'string' ||
    !Number.isFinite(Date.parse(r.observed_at_utc)) || typeof r.evidence_id !== 'string' || !r.evidence_id ||
    typeof r.signature_base64 !== 'string') return false;
  const trusted = truststore?.issuers?.[r.issuer];
  if (!trusted || !Array.isArray(trusted.stages) || !trusted.stages.includes(r.stage) ||
      typeof trusted.public_key_pem !== 'string') return false;
  try {
    const signature = Buffer.from(r.signature_base64, 'base64');
    if (signature.length !== 64) return false;
    return verifySignature(null, Buffer.from(canonicalClaims(r)), trusted.public_key_pem, signature);
  } catch { return false; }
}
export function inspect({ root, manifest, receipts = [], truststore = { issuers: {} } }) {
  validateManifest(manifest); root = realRoot(root);
  const report = [];
  for (const a of manifest.artifacts) {
    const stages = Object.fromEntries(STAGES.map(s => [s, 'unverified']));
    let local = 'invalid';
    try { const data = fs.readFileSync(safeFile(root, a.path));
      local = data.length === a.size_bytes && sha(data) === a.sha256 ? 'verified' : 'mismatch';
    } catch { local = 'missing_or_unsafe'; }
    for (const r of receipts) {
      if (r.artifact_sha256 !== a.sha256 || r.artifact_path !== a.path) continue;
      // A signed claim cannot promote custody when the local artifact itself is altered.
      if (local === 'verified' && verifyAttestation(r, truststore)) stages[r.stage] = 'attested';
    }
    report.push({ path: a.path, local_integrity: local, custody: stages });
  }
  return { schema: 'evercraft.artifact.custody-report.v1', project: manifest.project, version: manifest.version,
    generated_at_utc: new Date().toISOString(), artifacts: report,
    verified_local: report.filter(x => x.local_integrity === 'verified').length,
    issues: report.filter(x => x.local_integrity !== 'verified').length };
}
function argsFrom(argv) {
  const [command, ...tokens] = argv;
  const opts = {};
  for (let i = 0; i < tokens.length; i += 2) {
    if (!tokens[i]?.startsWith('--') || !tokens[i + 1]) fail('expected --option value');
    opts[tokens[i].slice(2)] = tokens[i + 1];
  }
  return { command, opts };
}
export function main(argv = process.argv.slice(2)) {
  const { command, opts } = argsFrom(argv);
  if (command === 'prepare') {
    if (!opts.root || !opts.project || !opts.version || !opts.out) fail('prepare requires --root --project --version --out');
    const root = realRoot(opts.root);
    const dest = path.resolve(opts.out);
    const relativeOutput = path.relative(root, dest).replaceAll('\\', '/');
    const exclude = relativeOutput.startsWith('../') || path.isAbsolute(relativeOutput) ? [] : [relativeOutput];
    const manifest = prepare({ root, project: opts.project, version: opts.version, exclude });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'w', mode: 0o600 });
    process.stdout.write(JSON.stringify({ output: dest, artifact_count: manifest.artifacts.length, status: 'local_manifest_only' }) + '\n');
  } else if (command === 'inspect') {
    if (!opts.root || !opts.manifest) fail('inspect requires --root and --manifest');
    const manifest = JSON.parse(fs.readFileSync(opts.manifest, 'utf8'));
    const receipts = opts.receipts ? JSON.parse(fs.readFileSync(opts.receipts, 'utf8')) : [];
    const truststore = opts.truststore ? JSON.parse(fs.readFileSync(opts.truststore, 'utf8')) : { issuers: {} };
    if (!Array.isArray(receipts)) fail('receipts must be an array');
    const report = inspect({ root: opts.root, manifest, receipts, truststore });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.issues) process.exitCode = 2;
    if (opts.require) {
      if (!STAGES.includes(opts.require)) fail('invalid required stage');
      if (report.artifacts.some(a => a.custody[opts.require] !== 'attested')) process.exitCode = 3;
    }
  } else fail('Usage: prepare --root DIR --project SLUG --version VER --out FILE | inspect --root DIR --manifest FILE [--receipts FILE --truststore FILE --require STAGE]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
