import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPublicFeed, canonical, FEED_SCHEMA, ENVELOPE_SCHEMA } from '../release-gate.mjs';

async function fixture(t) {
  const publicDir = await mkdtemp(join(tmpdir(), 'evercraft-live-gate-'));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  await mkdir(join(publicDir, 'media'));
  // A source-signature test fixture, not a viewable image.
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32, 8)]);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const mediaPath = 'media/' + sha + '.png';
  await writeFile(join(publicDir, mediaPath), bytes);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const now = new Date('2026-10-14T20:00:00.000Z');
  const payload = {
    receipt_id: 'live-approval-001', mission_key: 'private-systemia-reference-00001',
    source_evidence_refs: ['PRIVATE_SOURCE_NOT_FOR_PUBLIC_FEED'],
    release_state: 'approved', release_type: 'recorded_media', rights_state: 'cleared',
    sensitivity: 'public', minor_present: false, person_data: 'none', source_state: 'reviewed',
    title: 'Verified visual output', caption: 'Reviewed recording of a demonstration.',
    media_path: mediaPath, media_mime: 'image/png', media_sha256: sha, duration_seconds: 20,
    approval: { reviewer_id: 'authorized-editor', approved_at: '2026-10-14T19:00:00.000Z' },
    expires_at: '2026-10-15T19:00:00.000Z'
  };
  const envelope = (next = payload) => ({
    schema: ENVELOPE_SCHEMA, payload: next,
    signature: sign(null, Buffer.from(canonical(next)), privateKey).toString('base64')
  });
  return { publicDir, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }), privateKey, payload, envelope, now, mediaPath, bytes };
}
const verify = (f, p = f.payload, extras = {}) => buildPublicFeed({
  envelope: f.envelope(p), publicDir: f.publicDir, publicKeyPem: f.publicKeyPem, now: f.now, ...extras
});

test('approved signed, current, SHA-addressed media yields minimal public feed', async t => {
  const f = await fixture(t);
  const publicFeed = await verify(f);
  assert.equal(publicFeed.schema, FEED_SCHEMA);
  assert.equal(publicFeed.status, 'ready');
  assert.equal(publicFeed.items.length, 1);
  assert.equal(publicFeed.items[0].src, '/' + f.mediaPath);
  const serialized = JSON.stringify(publicFeed);
  assert.doesNotMatch(serialized, /PRIVATE_SOURCE_NOT_FOR_PUBLIC_FEED|private-systemia-reference|authorized-editor/);
  assert.match(publicFeed.items[0].truth_label, /NOT LIVE TELEMETRY/);
});

test('unsigned, forged, malformed and altered signatures fail closed', async t => {
  const f = await fixture(t);
  const altered = f.envelope();
  altered.payload.title = 'Tampered content';
  await assert.rejects(buildPublicFeed({ envelope: altered, publicDir: f.publicDir, publicKeyPem: f.publicKeyPem, now: f.now }), /signature mismatch/);
  const missing = f.envelope(); missing.signature = '';
  await assert.rejects(buildPublicFeed({ envelope: missing, publicDir: f.publicDir, publicKeyPem: f.publicKeyPem, now: f.now }), /signature encoding/);
});

test('expired, future-dated, long-lived approvals and revocations all block', async t => {
  const f = await fixture(t);
  await assert.rejects(verify(f, { ...f.payload, expires_at: '2026-10-13T19:00:00.000Z' }), /expired/);
  await assert.rejects(verify(f, { ...f.payload, expires_at: '2026-12-14T19:00:00.000Z' }), /seven days/);
  await assert.rejects(verify(f, { ...f.payload, approval: { ...f.payload.approval, approved_at: '2026-10-15T00:00:00.000Z' } }), /future-dated/);
  await assert.rejects(verify(f, f.payload, { revocations: [f.payload.receipt_id] }), /revoked/);
});

test('privacy, rights, evidence, approval and HTML are gated', async t => {
  const f = await fixture(t);
  await assert.rejects(verify(f, { ...f.payload, minor_present: true }), /privacy gate held/);
  await assert.rejects(verify(f, { ...f.payload, rights_state: 'unknown' }), /privacy gate held/);
  await assert.rejects(verify(f, { ...f.payload, source_state: 'unverified' }), /Evidence review missing/);
  await assert.rejects(verify(f, { ...f.payload, release_state: 'held' }), /not approved/);
  await assert.rejects(verify(f, { ...f.payload, title: '<img onerror=alert(1)>' }), /control\/HTML/);
});

test('path spoofing, wrong digest, wrong MIME and missing media fail', async t => {
  const f = await fixture(t);
  await assert.rejects(verify(f, { ...f.payload, media_path: '../secrets.png' }), /SHA256-addressed/);
  await assert.rejects(verify(f, { ...f.payload, media_sha256: 'a'.repeat(64) }), /SHA256-addressed/);
  await assert.rejects(verify(f, { ...f.payload, media_mime: 'text/html' }), /MIME/);
  await rm(join(f.publicDir, f.mediaPath));
  await assert.rejects(verify(f), /ENOENT/);
});

test('publisher revocation preserves no stale approved media', async t => {
  const f = await fixture(t);
  const base = f.publicDir;
  const envelopePath = join(base, 'signed.json'), keyPath = join(base, 'reviewer.pem'), revokedPath = join(base, 'revoked.json');
  await Promise.all([
    writeFile(envelopePath, JSON.stringify(f.envelope())),
    writeFile(keyPath, f.publicKeyPem),
    writeFile(revokedPath, JSON.stringify([]))
  ]);
  const script = new URL('../publish-public-feed.mjs', import.meta.url).pathname;
  const run = () => spawnSync(process.execPath, [script, envelopePath, keyPath, base, revokedPath], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(await readFile(join(base, 'public-feed.json'))).status, 'ready');
  await writeFile(revokedPath, JSON.stringify([f.payload.receipt_id]));
  const second = run();
  assert.equal(second.status, 1);
  const held = JSON.parse(await readFile(join(base, 'public-feed.json')));
  assert.equal(held.status, 'hold');
  assert.deepEqual(held.items, []);
});
