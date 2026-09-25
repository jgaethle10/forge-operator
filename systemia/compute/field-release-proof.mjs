import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FIELD_RELEASE_FILES,
  buildFieldRelease,
  verifyFieldRelease,
} from './field-release.mjs';

function copyPayload(sourceRoot, targetRoot) {
  for (const relative of FIELD_RELEASE_FILES) {
    const source = path.join(sourceRoot, relative);
    const target = path.join(targetRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node001-release-proof-'));
const kitRoot = path.join(root, 'kit');
const stateRoot = path.join(root, 'state');
const sourceCommit = 'a'.repeat(40);
const allocatorToken = 'field-release-proof-token';

copyPayload(sourceRoot, kitRoot);
const manifest = buildFieldRelease({
  root: kitRoot,
  sourceCommit,
});
fs.writeFileSync(
  path.join(kitRoot, 'FIELD_RELEASE.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

const verified = verifyFieldRelease({
  root: kitRoot,
  manifest,
});
assert.equal(verified.ok, true);
assert.equal(verified.source_commit, sourceCommit);
assert.equal(verified.payload_digest, manifest.payload_digest);

const moduleUrl = pathToFileURL(
  path.join(kitRoot, 'systemia/compute/node-seed.mjs')
).href;
const { startNodeSeed } = await import(moduleUrl);

const seed = await startNodeSeed({
  root: stateRoot,
  nodeId: 'release-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false,
});

try {
  assert.equal(seed.runtime_release_ref, sourceCommit);
  assert.equal(seed.runtime_payload_digest, manifest.payload_digest);

  const capacity = await request(`${seed.endpoint}/v1/capacity`);
  assert.equal(capacity.status, 200);
  assert.equal(capacity.body.runtime_release_ref, sourceCommit);
  assert.equal(capacity.body.runtime_payload_digest, manifest.payload_digest);

  const nonce = 'release-proof-nonce-123456789';
  const attested = await request(`${seed.endpoint}/v1/attest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${allocatorToken}` },
    body: JSON.stringify({ nonce }),
  });
  assert.equal(attested.status, 200);
  assert.equal(attested.body.attestation.statement.runtime_release_ref, sourceCommit);
  assert.equal(
    attested.body.attestation.statement.runtime_payload_digest,
    manifest.payload_digest
  );
} finally {
  await seed.close();
}

const tamperTarget = path.join(
  kitRoot,
  'systemia/compute/runtime-node.mjs'
);
fs.appendFileSync(tamperTarget, '\n// field-release-proof-tamper\n');
const tampered = verifyFieldRelease({
  root: kitRoot,
  manifest,
});
assert.equal(tampered.ok, false);
assert.equal(tampered.reason, 'field_release_file_hash_mismatch');
assert.equal(tampered.path, 'systemia/compute/runtime-node.mjs');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.node001.field-release-proof.v1',
  immutable_source_commit_bound: true,
  payload_digest_verified: true,
  nodeseed_self_verified_release: true,
  capacity_release_bound: true,
  signed_attestation_release_bound: true,
  post_build_tamper_rejected: true,
}, null, 2));

fs.rmSync(root, { recursive: true, force: true });
