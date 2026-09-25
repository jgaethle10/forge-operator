import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'
]);

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return `sha256:${hash.digest('hex')}`;
}

export function allowedMediaRoots(rootDir = process.cwd()) {
  const configured = String(process.env.FORENSISCOPE_MEDIA_ROOTS || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));

  const builtIn = [
    path.resolve(rootDir, 'artifacts/forensiscope-intake'),
    path.resolve(rootDir, 'artifacts/forensiscope-proof')
  ];

  return [...new Set([...configured, ...builtIn])];
}

export function validateAuthorizedMediaSource(raw, {
  rootDir = process.cwd(),
  requireExisting = true
} = {}) {
  const source = raw?.source || raw?.authorized_source || {};
  const authorization = raw?.authorization || {};

  if (authorization.confirmed !== true) {
    throw new Error('ForensiScope source authorization is required.');
  }
  if (!source.path) throw new Error('ForensiScope source.path is required.');

  const resolvedPath = path.resolve(String(source.path));
  const roots = allowedMediaRoots(rootDir);
  if (!roots.some((root) => isWithin(root, resolvedPath))) {
    throw new Error('ForensiScope source path is outside admitted media roots.');
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!MEDIA_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported ForensiScope media extension: ${extension || '(none)'}`);
  }

  if (requireExisting && !fs.existsSync(resolvedPath)) {
    throw new Error('ForensiScope source media does not exist.');
  }

  const stat = requireExisting ? fs.statSync(resolvedPath) : null;
  if (stat && !stat.isFile()) throw new Error('ForensiScope source must be a file.');

  const observedHash = requireExisting ? hashFile(resolvedPath) : null;
  if (source.sha256 && observedHash !== source.sha256) {
    throw new Error('ForensiScope source hash does not match the authorized manifest.');
  }

  return {
    path: resolvedPath,
    extension,
    size_bytes: stat?.size ?? null,
    sha256: observedHash || source.sha256 || null,
    authorization: {
      confirmed: true,
      scope: String(authorization.scope || 'analysis'),
      authorized_by: authorization.authorized_by || null,
      confirmed_at: authorization.confirmed_at || null
    },
    admitted_roots: roots
  };
}
