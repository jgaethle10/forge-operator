#!/usr/bin/env node
// Usage: node publish-public-feed.mjs ENVELOPE.json REVIEWER_PUBLIC_KEY.pem PUBLIC_DIR REVOCATIONS.json
// Operator must publish/serve the output and media separately. This command never starts a stream.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildPublicFeed, holdFeed } from './release-gate.mjs';

const [, , envelopePath, keyPath, publicDirArg, revocationsPath] = process.argv;
if (!envelopePath || !keyPath || !publicDirArg || !revocationsPath) {
  console.error('Usage: node publish-public-feed.mjs ENVELOPE.json REVIEWER_PUBLIC_KEY.pem PUBLIC_DIR REVOCATIONS.json');
  process.exit(2);
}
const publicDir = resolve(publicDirArg);
const feedPath = join(publicDir, 'public-feed.json');
async function publish(feed) {
  await mkdir(publicDir, { recursive: true });
  const temp = feedPath + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(feed, null, 2) + '\n', { mode: 0o644, flag: 'wx' });
  await rename(temp, feedPath);
}
try {
  const envelope = JSON.parse(await readFile(envelopePath, 'utf8'));
  const publicKeyPem = await readFile(keyPath, 'utf8');
  const revoked = JSON.parse(await readFile(revocationsPath, 'utf8'));
  if (!Array.isArray(revoked) || !revoked.every(x => typeof x === 'string')) throw Error('Revocation list invalid');
  const feed = await buildPublicFeed({ envelope, publicDir, publicKeyPem, revocations: revoked });
  await publish(feed);
  console.log('Public feed generated: 1 reviewed recording; no stream started.');
} catch (error) {
  // Never keep serving a previously approved feed when today's gate fails.
  await publish(holdFeed());
  console.error('Public feed HELD: ' + String(error.message).slice(0, 160));
  process.exitCode = 1;
}