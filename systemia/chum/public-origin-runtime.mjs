import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeProductDomain(value) {
  const domain = String(value || 'evercraft.app').trim().toLowerCase().replace(/\.$/, '');
  if (!domain || domain.length > 253 || domain.includes('://') || domain.includes('/') || domain.includes(':')) {
    throw new Error('invalid_product_domain');
  }
  for (const label of domain.split('.')) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      throw new Error('invalid_product_domain');
    }
  }
  return domain;
}

function requestHostname(req) {
  const raw = String(req.headers.host || '').trim().toLowerCase();
  if (!raw) return null;
  try {
    return new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function productHostRoute(req, productDomain) {
  const host = requestHostname(req);
  if (!host || host === productDomain || !host.endsWith('.' + productDomain)) return null;
  const slug = host.slice(0, -(productDomain.length + 1));
  if (
    !slug ||
    slug.includes('.') ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)
  ) {
    return { host, slug: null };
  }
  return { host, slug };
}

function requestOrigin(req, configuredOrigin = null) {
  if (configuredOrigin) return configuredOrigin;
  const host = String(req.headers.host || '').trim();
  if (!host) return null;
  const forwarded = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const protocol = forwarded === 'https' || forwarded === 'http'
    ? forwarded
    : 'http';
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function decodePathname(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl || '/', 'http://evercraft.invalid').pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) return null;
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.well-known')) return null;
  return pathname;
}

function staticFile(publicRoot, pathname) {
  const relative = pathname.replace(/^\/+/, '');
  const candidates = [];
  if (!relative) {
    candidates.push(path.join(publicRoot, 'index.html'));
    candidates.push(path.join(publicRoot, 'chum', 'index.html'));
  } else {
    candidates.push(path.join(publicRoot, relative));
    if (pathname.endsWith('/')) candidates.push(path.join(publicRoot, relative, 'index.html'));
    else candidates.push(path.join(publicRoot, relative, 'index.html'));
  }

  const rootReal = fs.realpathSync(publicRoot);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!isWithin(path.resolve(publicRoot), resolved)) continue;
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) continue;
    if (!stat.isFile()) continue;
    const real = fs.realpathSync(resolved);
    if (!isWithin(rootReal, real)) continue;
    return real;
  }
  return null;
}

function contentType(file) {
  return MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
}

function sendStaticFile(method, res, file) {
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'content-type': contentType(file),
    'content-length': stat.size,
    etag: `"${sha(fs.readFileSync(file))}"`,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

function readTrackedSurfaceCount(publicRoot) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), 'utf8'));
    return Number(state.url_count || Object.keys(state.entries || {}).length || 0);
  } catch {
    return 0;
  }
}

function discoveryHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('X-CHUM-Public-Origin', 'v1');
  res.setHeader('Link', [
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</sitemap.xml>; rel="sitemap"; type="application/xml"',
    '</chum/freshness.xml>; rel="alternate"; type="application/atom+xml"',
    '</chum/hot/>; rel="alternate"; type="text/html"',
    '</.well-known/evercraft-discovery.json>; rel="service-desc"; type="application/json"',
  ].join(', '));
}

export class ChumPublicOriginRuntime {
  constructor({
    publicRoot,
    host = '127.0.0.1',
    port = 0,
    publicOrigin = '',
    productDomain = 'evercraft.app',
  } = {}) {
    if (!publicRoot) throw new Error('publicRoot is required');
    const resolvedRoot = path.resolve(publicRoot);
    if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
      throw new Error('publicRoot must be an existing directory');
    }
    this.publicRoot = resolvedRoot;
    this.host = String(host || '127.0.0.1');
    this.port = Math.max(0, Math.min(65535, Number(port || 0)));
    this.publicOrigin = normalizeOrigin(publicOrigin);
    this.productDomain = normalizeProductDomain(productDomain);
    this.instanceId = `chum_${randomBytes(12).toString('hex')}`;
    this.deploymentReceiptRef = '';
    this.startedAt = null;
    this.server = null;
    this.url = null;
  }

  health() {
    return {
      schema: 'evercraft.chum-public-origin.health.v1',
      ok: Boolean(this.server?.listening),
      service: 'chum-public-origin',
      runtime: 'Evercraft Compute',
      instance_id: this.instanceId,
      deployment_receipt_bound: Boolean(this.deploymentReceiptRef),
      deployment_receipt_ref: this.deploymentReceiptRef || null,
      product_domain: this.productDomain,
      tracked_public_surfaces: readTrackedSurfaceCount(this.publicRoot),
      started_at: this.startedAt,
    };
  }

  setDeploymentReceipt(receiptRef) {
    this.deploymentReceiptRef = String(receiptRef || '').trim();
    return this.health();
  }

  async start() {
    if (this.server) throw new Error('CHUM public origin already started');

    this.server = http.createServer(async (req, res) => {
      try {
        const method = String(req.method || 'GET').toUpperCase();
        if (method === 'OPTIONS') {
          discoveryHeaders(res);
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.writeHead(204);
          res.end();
          return;
        }
        if (method !== 'GET' && method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD, OPTIONS');
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'read_only_public_origin' }));
          return;
        }

        const pathname = decodePathname(req.url);
        if (!pathname) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'invalid_path' }));
          return;
        }

        discoveryHeaders(res);

        if (pathname === '/api/health') {
          const data = Buffer.from(JSON.stringify(this.health()));
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': data.length,
            'cache-control': 'no-store',
          });
          if (method === 'HEAD') res.end();
          else res.end(data);
          return;
        }

        const productRoute = productHostRoute(req, this.productDomain);
        if (productRoute) {
          if (!productRoute.slug) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'unknown_product_host' }));
            return;
          }
          const productRoot = path.join(this.publicRoot, 'chum', 'products', productRoute.slug);
          if (
            !fs.existsSync(productRoot) ||
            !fs.statSync(productRoot).isDirectory()
          ) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: 'unknown_product_host',
              product_key: productRoute.slug,
            }));
            return;
          }
          const productFile = staticFile(productRoot, pathname);
          if (productFile) {
            sendStaticFile(method, res, productFile);
            return;
          }
          if (pathname === '/') {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: 'product_surface_not_found',
              product_key: productRoute.slug,
            }));
            return;
          }
        }

        if (pathname === '/') {
          res.writeHead(308, { location: '/chum/' });
          res.end();
          return;
        }

        const origin = requestOrigin(req, this.publicOrigin);

        if (pathname === '/sitemap.xml') {
          const file = staticFile(this.publicRoot, pathname);
          if (!file) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Sitemap unavailable.\n');
            return;
          }
          let body = fs.readFileSync(file, 'utf8');
          if (origin) {
            body = body.replace(/<loc>(\/[^<]*)<\/loc>/g, (_match, relative) =>
              `<loc>${origin}${relative}</loc>`
            );
          }
          const data = Buffer.from(body);
          res.writeHead(200, {
            'content-type': 'application/xml; charset=utf-8',
            'content-length': data.length,
          });
          if (method === 'HEAD') res.end();
          else res.end(data);
          return;
        }

        if (pathname === '/robots.txt') {
          const file = staticFile(this.publicRoot, pathname);
          let body = file ? fs.readFileSync(file, 'utf8') : 'User-agent: *\nAllow: /\n';
          body = body.replace(/^Sitemap:.*$/gmi, '').trimEnd();
          if (origin) body += `\n\nSitemap: ${origin}/sitemap.xml\n`;
          else body += '\n';
          const data = Buffer.from(body);
          res.writeHead(200, {
            'content-type': 'text/plain; charset=utf-8',
            'content-length': data.length,
          });
          if (method === 'HEAD') res.end();
          else res.end(data);
          return;
        }

        const file = staticFile(this.publicRoot, pathname);
        if (!file) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'public_surface_not_found' }));
          return;
        }

        sendStaticFile(method, res, file);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          error: 'public_origin_runtime_error',
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, resolve);
    });

    const address = this.server.address();
    const actualPort = typeof address === 'object' && address ? address.port : this.port;
    const displayHost = this.host === '0.0.0.0' ? '127.0.0.1' : this.host;
    this.url = `http://${displayHost}:${actualPort}`;
    this.startedAt = new Date().toISOString();
    return this;
  }

  async close() {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

export async function startChumPublicOrigin(options = {}) {
  const runtime = new ChumPublicOriginRuntime(options);
  await runtime.start();
  return runtime;
}
