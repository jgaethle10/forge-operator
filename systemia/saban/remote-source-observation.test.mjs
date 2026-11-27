import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EvercraftRemoteOperator } from '../compute/remote-operator.mjs';
import { verifyRemoteSourceObservation } from './remote-source-observation.mjs';

const sha = bytes =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
const verify = input => verifyRemoteSourceObservation(input);

function fixture(t, contents = '🦃 Verification cannot be guessed from a partial file.\n') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-remote-pages-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  const source = Buffer.from(contents);
  fs.writeFileSync(path.join(home, 'source.txt'), source);
  const operator = new EvercraftRemoteOperator({
    roots: { home }, stateDir: path.join(tmp, 'state'),
  });
  const expectedSha256 = sha(source);
  const pages = [];
  let cursor = 0;
  while (cursor !== null) {
    const page = operator.read({
      root_key: 'home', path: 'source.txt',
      encoding: 'base64', max_bytes: 7, offset_bytes: cursor,
      ...(cursor ? { expected_sha256: expectedSha256 } : {}),
    });
    pages.push(page);
    cursor = page.next_offset_bytes;
    assert.ok(pages.length < 128);
  }
  return {
    missionId: 'synthetic-mission-204',
    sourceId: 'verified-source-001',
    rootKey: 'home',
    relativePath: 'source.txt',
    expectedSha256, expectedBytes: source.length,
    pages,
    workerReport: { status: 'completed', verified: true },
  };
}

test('genuine node file bytes, including split UTF-8, verify only at final page', t => {
  const f = fixture(t);
  const r = verify(f);
  assert.equal(r.status, 'source_bytes_verified');
  assert.equal(r.source_bytes_verified, true);
  assert.equal(r.reason, null);
  assert.equal(r.observed_sha256, f.expectedSha256);
  assert.equal(r.observed_bytes, f.expectedBytes);
  assert.equal(r.pages_verified, f.pages.length);
  assert.equal(r.worker_claimed_complete, true);
  assert.equal(r.objective_semantics_verified, false);
  assert.equal(r.remote_node_identity_attested, false);
  assert.equal(r.coordinator_expectation_origin_attested, false);
  assert.equal(r.runtime_dispatched, false);
  assert.equal(JSON.stringify(r).includes('Verification cannot be guessed'), false);
  assert.equal(JSON.stringify(r).includes(f.pages[0].content), false);
});

test('model-reported completion cannot replace absent pages', t => {
  const f = fixture(t);
  f.pages = [];
  const r = verify(f);
  assert.equal(r.status, 'hold');
  assert.equal(r.worker_claimed_complete, true);
  assert.equal(r.reason, 'pages_required_or_limit_exceeded');
});

test('partial pages cannot claim complete source', t => {
  const f = fixture(t);
  f.pages.pop();
  assert.equal(verify(f).reason, 'source_read_incomplete');
});

test('dropping an interior page creates an offset gap', t => {
  const f = fixture(t);
  f.pages.splice(1, 1);
  assert.equal(verify(f).reason, 'page_offset_mismatch');
});

test('replaying a page creates an offset mismatch', t => {
  const f = fixture(t);
  f.pages.splice(1, 0, f.pages[0]);
  assert.equal(verify(f).reason, 'page_offset_mismatch');
});

test('reordering pages creates an offset mismatch', t => {
  const f = fixture(t);
  [f.pages[0], f.pages[1]] = [f.pages[1], f.pages[0]];
  assert.equal(verify(f).reason, 'page_offset_mismatch');
});

test('false completion marker cannot hide missing tail', t => {
  const f = fixture(t);
  f.pages = [f.pages[0]];
  f.pages[0].truncated = false;
  f.pages[0].next_offset_bytes = null;
  assert.equal(verify(f).reason, 'final_page_size_or_cursor_invalid');
});

test('stale next-offset and empty-progress page fail closed', t => {
  const f = fixture(t);
  f.pages[0].next_offset_bytes += 1;
  assert.equal(verify(f).reason, 'page_cursor_invalid');
});

test('changed page content with claimed hash fails', t => {
  const f = fixture(t);
  f.pages[0].content = Buffer.from('abcdefg').toString('base64');
  assert.equal(verify(f).reason, 'page_content_integrity_mismatch');
});

test('changed page and forged page hash still fail whole-source hash', t => {
  const f = fixture(t);
  const bytes = Buffer.from('abcdefg');
  f.pages[0].content = bytes.toString('base64');
  f.pages[0].page_sha256 = sha(bytes);
  assert.equal(verify(f).reason, 'assembled_source_hash_mismatch');
});

test('wrong file identity, path or source byte length never reconcile', t => {
  const f = fixture(t);
  f.pages[1].sha256 = sha('other');
  assert.equal(verify(f).reason, 'page_identity_binding_mismatch');
  const g = fixture(t);
  g.pages[0].path = 'different.txt';
  assert.equal(verify(g).reason, 'page_identity_binding_mismatch');
  const h = fixture(t);
  h.expectedBytes += 1;
  assert.equal(verify(h).reason, 'page_identity_binding_mismatch');
});

test('coordinator predeclared source identity and mission binding are mandatory', t => {
  const f = fixture(t);
  assert.equal(verify({ ...f, expectedSha256: null }).reason,
    'predeclared_source_identity_invalid');
  assert.equal(verify({ ...f, expectedBytes: undefined }).reason,
    'predeclared_source_identity_invalid');
  assert.equal(verify({ ...f, sourceId: '../untrusted' }).reason,
    'mission_source_binding_required');
  assert.equal(verify({ ...f, relativePath: '../secret' }).reason,
    'source_path_binding_invalid');
});

test('noncanonical base64 and extra pages fail closed', t => {
  const f = fixture(t);
  f.pages[0].content = 'AQ==\n';
  assert.equal(verify(f).reason, 'page_base64_invalid');
  const g = fixture(t);
  g.pages.push(g.pages[0]);
  assert.equal(verify(g).reason, 'unexpected_page_after_end');
});

test('page count and total source cap are enforced before consuming payloads', t => {
  const f = fixture(t);
  f.pages = Array.from({ length: 129 }, () => f.pages[0]);
  assert.equal(verify(f).reason, 'pages_required_or_limit_exceeded');
  assert.equal(verify({ ...fixture(t), expectedBytes: 16 * 1024 * 1024 + 1 }).reason,
    'predeclared_source_identity_invalid');
});

test('empty file is complete only with one final empty page and declared empty digest', t => {
  const f = fixture(t, '');
  assert.equal(f.pages.length, 1);
  assert.equal(verify(f).status, 'source_bytes_verified');
  f.pages[0].truncated = true;
  f.pages[0].next_offset_bytes = 0;
  assert.equal(verify(f).reason, 'page_cursor_invalid');
});
