// Evercraft LIVE public-release gate v1. Node built-ins only.
// Publish tool consumes an externally reviewed, Ed25519-signed envelope.
// The public output intentionally never carries raw mission identifiers or evidence URLs.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, realpath, stat, lstat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const ENVELOPE_SCHEMA = 'evercraft.live.signed-release.v1';
export const FEED_SCHEMA = 'evercraft.live.public-feed.v1';
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MIMES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm'
});

export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported canonical JSON value');
}

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function instant(input, field) {
  check(typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input), field + ' format');
  const ms = Date.parse(input);
  check(Number.isFinite(ms), field + ' invalid');
  return ms;
}

function safeText(v, max, field) {
  check(typeof v === 'string' && v.trim().length >= 3 && v.length <= max, field + ' invalid');
  check(!/[\u0000-\u001f<>]/.test(v), field + ' control/HTML character');
  return v.trim();
}

function magicMatches(buf, ext) {
  if (ext === 'png') return buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (ext === 'jpg' || ext === 'jpeg') return buf.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (ext === 'webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (ext === 'mp4') return buf.toString('ascii', 4, 8) === 'ftyp';
  if (ext === 'webm') return buf.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
  return false;
}

export function holdFeed(now = new Date()) {
  return { schema: FEED_SCHEMA, status: 'hold', generated_at: now.toISOString(), expires_at: now.toISOString(), items: [] };
}

export async function buildPublicFeed({ envelope, publicDir, publicKeyPem, revocations = [], now = new Date() }) {
  check(envelope && envelope.schema === ENVELOPE_SCHEMA, 'Unrecognized signed envelope');
  check(envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload), 'Missing payload');
  check(typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]{86}==$|^[A-Za-z0-9+/]{86}=$/.test(envelope.signature), 'Invalid signature encoding');
  check(typeof publicKeyPem === 'string' && publicKeyPem.includes('PUBLIC KEY'), 'Reviewer public key required');
  const key = createPublicKey(publicKeyPem);
  check(key.asymmetricKeyType === 'ed25519', 'Ed25519 reviewer key required');
  const signedBytes = Buffer.from(canonical(envelope.payload), 'utf8');
  check(verify(null, signedBytes, key, Buffer.from(envelope.signature, 'base64')), 'Reviewer signature mismatch');
  const p = envelope.payload;
  check(p.release_state === 'approved' && p.release_type === 'recorded_media', 'Release not approved');
  check(p.rights_state === 'cleared' && p.sensitivity === 'public' && p.minor_present === false && p.person_data === 'none', 'Rights or privacy gate held');
  check(p.source_state === 'reviewed', 'Evidence review missing');
  check(typeof p.receipt_id === 'string' && /^[a-z0-9_-]{8,100}$/.test(p.receipt_id), 'Invalid receipt identifier');
  check(typeof p.mission_key === 'string' && p.mission_key.length > 5, 'Missing private source mission');
  check(!revocations.includes(p.receipt_id), 'Receipt revoked');
  check(p.approval && typeof p.approval.reviewer_id === 'string' && p.approval.reviewer_id.length >= 3, 'Missing reviewer');
  const approvedMs = instant(p.approval.approved_at, 'approved_at');
  const expiresMs = instant(p.expires_at, 'expires_at');
  check(approvedMs <= now.getTime() && expiresMs > now.getTime(), 'Approval future-dated or expired');
  check(expiresMs - approvedMs <= 7 * 86400_000, 'Approval validity exceeds seven days');
  const title = safeText(p.title, 100, 'title');
  const caption = safeText(p.caption, 280, 'caption');
  check(Number.isInteger(p.duration_seconds) && p.duration_seconds >= 5 && p.duration_seconds <= 300, 'Duration outside bounds');
  check(typeof p.media_sha256 === 'string' && /^[a-f0-9]{64}$/.test(p.media_sha256), 'Media digest missing');
  check(typeof p.media_path === 'string', 'Media path missing');
  const match = /^media\/([a-f0-9]{64})\.(png|jpg|jpeg|webp|mp4|webm)$/.exec(p.media_path);
  check(Boolean(match) && match[1] === p.media_sha256, 'Media path must be SHA256-addressed');
  check(MIMES[match[2]] === p.media_mime, 'MIME/extension mismatch');

  const root = await realpath(resolve(publicDir));
  const target = resolve(join(root, p.media_path));
  check(!relative(root, target).startsWith('..' + sep) && relative(root, target) !== '..', 'Media path escapes public root');
  const targetReal = await realpath(target);
  const rel = relative(root, targetReal);
  check(rel && rel !== '..' && !rel.startsWith('..' + sep), 'Media symlink escapes public root');
  check(!(await lstat(target)).isSymbolicLink(), 'Media symlinks forbidden');
  const info = await stat(targetReal);
  check(info.isFile() && info.size > 12 && info.size <= MAX_MEDIA_BYTES, 'Media file invalid or oversized');
  const bytes = await readFile(targetReal);
  check(magicMatches(bytes, match[2]), 'Media magic bytes mismatch');
  const digest = createHash('sha256').update(bytes).digest('hex');
  check(digest === p.media_sha256, 'Media digest mismatch');

  return {
    schema: FEED_SCHEMA,
    status: 'ready',
    generated_at: now.toISOString(),
    expires_at: p.expires_at,
    items: [{
      receipt_id: p.receipt_id, title, caption, content_kind: 'recorded_output',
      truth_label: 'RECORDED OUTPUT / EDITOR-APPROVED, NOT LIVE TELEMETRY',
      src: '/' + p.media_path, mime: p.media_mime, sha256: digest,
      approved_at: p.approval.approved_at, seconds: p.duration_seconds
    }]
  };
}