// Strict read-only owned Fabric frontage for Aiden's Lab.
// Only explicitly reviewed public files are served, never arbitrary repo paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
export const AIDEN_LAB_FILES = Object.freeze({
  'index.html': 'text/html; charset=utf-8',
  'app.mjs': 'text/javascript; charset=utf-8',
  'catalog.mjs': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'mark.svg': 'image/svg+xml'
});

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'"
].join('; ');

export function resolveAidenLabRequest(url) {
  let parsed;
  try { parsed = new URL(String(url || '/'), 'http://fabric.local'); }
  catch { return { handled: false }; }
  const pathname = parsed.pathname;
  if (pathname === '/aiden-lab') return { handled: true, redirect: '/aiden-lab/' };
  if (!pathname.startsWith('/aiden-lab/')) return { handled: false };
  const name = pathname === '/aiden-lab/' ? 'index.html' : pathname.slice('/aiden-lab/'.length);
  if (!Object.hasOwn(AIDEN_LAB_FILES, name)) return { handled: true, status: 404 };
  // No arbitrary filenames, nested directories, encoded path escapes or symlinks.
  if (!/^[a-z0-9.-]+$/.test(name)) return { handled: true, status: 404 };
  return { handled: true, name, contentType: AIDEN_LAB_FILES[name] };
}

function plain(res, status, message, method = 'GET') {
  const data = Buffer.from(message);
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  return method === 'HEAD' ? res.end() : res.end(data);
}

export function serveAidenLab(req, res, { repoRoot = ROOT } = {}) {
  const route = resolveAidenLabRequest(req.url);
  if (!route.handled) return false;
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    plain(res, 405, 'Method not allowed', method);
    return true;
  }
  if (route.redirect) {
    res.writeHead(308, { location: route.redirect, 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  if (!route.name) {
    plain(res, 404, 'Research asset not found', method);
    return true;
  }
  const sourceRoot = path.resolve(repoRoot, 'public/aiden-lab');
  const target = path.resolve(sourceRoot, route.name);
  if (path.dirname(target) !== sourceRoot) {
    plain(res, 404, 'Research asset not found', method);
    return true;
  }
  let body;
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 300_000)
      throw Error('unsafe_or_oversized_public_asset');
    body = fs.readFileSync(target);
  } catch {
    plain(res, 503, 'Aiden Lab static source unavailable', method);
    return true;
  }
  res.writeHead(200, {
    'content-type': route.contentType,
    'content-length': body.length,
    'cache-control': 'no-store',
    'etag': '"' + createHash('sha256').update(body).digest('hex') + '"',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': CSP,
    'x-evercraft-static-program': 'aidens-lab-v1'
  });
  if (method === 'HEAD') res.end();
  else res.end(body);
  return true;
}
