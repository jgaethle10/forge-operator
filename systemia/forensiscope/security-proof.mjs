#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashFile, validateAuthorizedMediaSource } from './authorized-source.mjs';

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-security-'));
const admitted = path.join(rootDir, 'artifacts', 'forensiscope-intake');
const outside = path.join(rootDir, 'outside');
fs.mkdirSync(admitted, { recursive: true });
fs.mkdirSync(outside, { recursive: true });

const good = path.join(admitted, 'authorized.wav');
const escaped = path.join(outside, 'outside.wav');
const link = path.join(admitted, 'symlink.wav');

fs.writeFileSync(good, Buffer.from('RIFF0000WAVEproof'));
fs.writeFileSync(escaped, Buffer.from('RIFF0000WAVEoutside'));
fs.symlinkSync(escaped, link);

const authorization = {
  confirmed: true,
  scope: 'synthetic-security-proof',
  authorized_by: 'forensiscope-security-proof',
  confirmed_at: new Date().toISOString()
};

try {
  const accepted = validateAuthorizedMediaSource({
    source: {
      path: good,
      sha256: hashFile(good)
    },
    authorization
  }, {
    rootDir,
    maxBytes: 1024
  });

  assert.equal(accepted.path, fs.realpathSync(good));
  assert.equal(accepted.sha256, hashFile(good));

  assert.throws(
    () => validateAuthorizedMediaSource({
      source: {
        path: link,
        sha256: hashFile(escaped)
      },
      authorization
    }, {
      rootDir,
      maxBytes: 1024
    }),
    /symlinks are not admitted|outside admitted media roots/
  );

  assert.throws(
    () => validateAuthorizedMediaSource({
      source: {
        path: good,
        sha256: 'sha256:' + '0'.repeat(64)
      },
      authorization
    }, {
      rootDir,
      maxBytes: 1024
    }),
    /hash does not match/
  );

  assert.throws(
    () => validateAuthorizedMediaSource({
      source: {
        path: good,
        sha256: hashFile(good)
      },
      authorization
    }, {
      rootDir,
      maxBytes: 4
    }),
    /exceeds admitted byte limit/
  );

  assert.throws(
    () => validateAuthorizedMediaSource({
      source: {
        path: good,
        sha256: hashFile(good)
      },
      authorization: {
        ...authorization,
        confirmed: false
      }
    }, {
      rootDir,
      maxBytes: 1024
    }),
    /authorization is required/
  );

  console.log(JSON.stringify({
    schema: 'evercraft.forensiscope.source-admission-security-proof.v1',
    status: 'pass',
    canonical_path_enforced: true,
    direct_symlink_rejected: true,
    symlink_escape_rejected: true,
    source_hash_enforced: true,
    source_byte_limit_enforced: true,
    explicit_authorization_enforced: true
  }));
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
