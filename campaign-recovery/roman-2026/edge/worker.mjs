import { EMBEDDED_HTML } from './embedded-site.mjs';

const DONATE_URL = 'https://donate.voteroman.com/';
const MIRROR_URL = 'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/';
const PRIMARY_HOSTS = new Set(['voteroman.com', 'www.voteroman.com']);

const securityHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=60, must-revalidate',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function hostAllowed(host, env) {
  const configured = String(env?.PREVIEW_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return PRIMARY_HOSTS.has(host) || configured.includes(host) || host === 'localhost' || host === '127.0.0.1';
}

function verifiedHtml(text) {
  return text.length > 5000 &&
    text.includes('Roman Kilinkaridis') &&
    text.includes(DONATE_URL) &&
    text.includes('</html>') &&
    !text.includes('[APP UNAVAILABLE]');
}

function replyHtml(html, source, method) {
  const headers = new Headers(securityHeaders);
  headers.set('x-evercraft-shell-source', source);
  return new Response(method === 'HEAD' ? null : html, { status: 200, headers });
}

export async function handleRequest(request, { env = {}, fetcher = fetch } = {}) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!hostAllowed(host, env)) return new Response('Misdirected request', { status: 421 });

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (url.pathname === '/_evercraft/health') {
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({
      state: 'ready',
      system: 'evercraft.roman.edge-shell.v1',
      content: 'embedded_read_only_campaign_information',
      base44_dependency: false,
      registrar_control_verified: false
    }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/robots.txt') {
    return new Response(request.method === 'HEAD' ? null : 'User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
  if (url.pathname === '/donate') {
    return Response.redirect(DONATE_URL, 302);
  }
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/.well-known/') ||
      url.pathname === '/favicon.ico') {
    return new Response('Not found', { status: 404 });
  }

  // Fail closed to a verified, embedded site. Never proxy through Base44.
  // An optional upstream is a separate published mirror, not the broken domain.
  if (env.USE_REMOTE_MIRROR === 'true') {
    const aborter = new AbortController();
    const wait = setTimeout(() => aborter.abort(), 2500);
    try {
      const resp = await fetcher(MIRROR_URL, { redirect: 'error', signal: aborter.signal });
      if (resp.ok && (resp.headers.get('content-type') || '').includes('text/html')) {
        const text = await resp.text();
        if (verifiedHtml(text)) return replyHtml(text, 'verified-remote-mirror', request.method);
      }
    } catch {
      // Network faults never become visitor-facing outage pages.
    } finally {
      clearTimeout(wait);
    }
  }
  return replyHtml(EMBEDDED_HTML, 'embedded', request.method);
}

export default {
  fetch(request, env, _context) {
    return handleRequest(request, { env });
  }
};
