#!/usr/bin/env node
// Evercraft privacy-minimized byte comparison of two local snapshots.
// Never uploads, signs, deploys, publishes, or asserts provider authentication.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const COMPARISON_SCHEMA = 'evercraft.artifact.roundtrip-comparison.v1';

function openRegularFile(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\0')) {
    throw new Error('invalid input filename');
  }
  const absolute = path.resolve(filename);
  // Reject symlink at every component. Do not resolve through a potentially redirected path.
  let cur = path.parse(absolute).root;
  const rest = absolute.slice(cur.length).split(path.sep).filter(Boolean);
  for (const segment of rest) {
    cur = path.join(cur, segment);
    const stat = fs.lstatSync(cur);
    if (stat.isSymbolicLink()) throw new Error('symlink not admitted');
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(absolute, flags);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('not a regular file');
    return { fd, stat };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

export function fingerprint(filename) {
  const { fd } = openRegularFile(filename);
  try {
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      digest.update(buffer.subarray(0, read));
      bytes += read;
    }
    return { size_bytes: bytes, sha256: digest.digest('hex') };
  } finally {
    fs.closeSync(fd);
  }
}

export function compareSnapshots({ original, restored }) {
  const source = fingerprint(original);
  const copy = fingerprint(restored);
  const sourceHash = Buffer.from(source.sha256, 'hex');
  const copyHash = Buffer.from(copy.sha256, 'hex');
  const matched = source.size_bytes === copy.size_bytes && timingSafeEqual(sourceHash, copyHash);
  return {
    schema: COMPARISON_SCHEMA,
    observed_at_utc: new Date().toISOString(),
    comparison: matched ? 'byte_identical' : 'mismatch',
    original: source,
    restored: copy,
    // Neither a caller-provided path nor a byte comparison proves provider identity.
    backup_roundtrip_attested: false,
    provider_authentication: 'not_evaluated',
    device_install: 'unverified',
    publication: 'unverified'
  };
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('expected --flag value');
    const key = args[i].slice(2);
    if (!['original', 'restored', 'out'].includes(key) || options[key]) throw new Error('unsupported or duplicate option');
    options[key] = args[i + 1];
  }
  if (!options.original || !options.restored) throw new Error('requires --original and --restored');
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  if (opts.out && [opts.original, opts.restored].some(p => path.resolve(p) === path.resolve(opts.out))) {
    throw new Error('report cannot overwrite either input');
  }
  const report = compareSnapshots(opts);
  const output = JSON.stringify(report, null, 2) + '\n';
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, output, { flag: 'wx', mode: 0o600 });
  } else {
    process.stdout.write(output);
  }
  return report.comparison === 'byte_identical' ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
