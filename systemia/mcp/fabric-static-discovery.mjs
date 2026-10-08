import fs from 'node:fs';
import path from 'node:path';

const CANONICAL_ORIGIN = 'https://fabric.systemiacommandcenters.com';
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

function decodeAllowedRoute(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://fabric.invalid').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.includes('//')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return null;
  if (
    pathname !== '/sitemap.xml' &&
    pathname !== '/robots.txt' &&
    pathname !== '/chum' &&
    !pathname.startsWith('/chum/') &&
    pathname !== '/research' &&
    !pathname.startsWith('/research/')
  ) return null;
  return pathname;
}

function resolvePublicFile(publicRoot, pathname) {
  const root = path.resolve(publicRoot);
  const relative = pathname.slice(1).replace(/\/+$/, '');
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(target)) return null;
  let file = target;
  let stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return null;
  if (stat.isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return null;
  stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) return null;
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(file);
  if (!realFile.startsWith(realRoot + path.sep)) return null;
  const ext = path.extname(realFile).toLowerCase();
  if (!MIME.has(ext)) return null;
  return { file: realFile, contentType: MIME.get(ext) };
}

function xmlAbsoluteLocations(body) {
  return body.replace(/<loc>(\/[^<]*)<\/loc>/g, (_all, relative) =>
    '<loc>' + CANONICAL_ORIGIN + relative + '</loc>'
  );
}

/**
 * Explicitly public read-only discovery pages. Never serves private repository
 * content or mounts arbitrary filesystem paths. Returns false for unrelated
 * Fabric routes, preserving the existing MCP, payments and specialist routing.
 */
export function serveFabricStaticDiscovery(req, res, { publicRoot } = {}) {
  const pathname = decodeAllowedRoute(String(req.url || ''));
  if (pathname === null) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  const asset = resolvePublicFile(publicRoot, pathname);
  if (!asset) {
    const payload = Buffer.from(JSON.stringify({ error: 'public_discovery_route_missing' }));
    res.writeHead(404, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': payload.length,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, follow',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(payload);
    return true;
  }

  let body = fs.readFileSync(asset.file);
  if (pathname === '/sitemap.xml' || pathname === '/chum/sitemap.xml' ||
      /^\/chum\/sitemaps\/[a-z0-9-]+\.xml$/.test(pathname)) {
    body = Buffer.from(xmlAbsoluteLocations(body.toString('utf8')));
  }
  if (pathname === '/robots.txt') {
    const txt = body.toString('utf8').replace(/^Sitemap:.*$/gmi, '').trimEnd();
    body = Buffer.from(txt + '\nSitemap: ' + CANONICAL_ORIGIN + '/sitemap.xml\n');
  }

  const isDraft = pathname === '/research' || pathname.startsWith('/research/');
  const headers = {
    'content-type': asset.contentType,
    'content-length': body.length,
    'cache-control': 'public, max-age=60, must-revalidate',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': isDraft ? 'noindex, follow' : 'index, follow',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else res.end(body);
  return true;
}
