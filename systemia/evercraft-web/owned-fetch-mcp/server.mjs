#!/usr/bin/env node
/**
 * Evercraft Web owned Fetch MCP candidate.
 * Local, authenticated, read-only; not a production replacement for the
 * currently published Base44 remote. No Search, Browser, or payment authority.
 */
import http from 'node:http';
import https from 'node:https';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  normalizePublicHttpUrl,
  resolvePublicHost,
  isNonPublicIp,
  redactUrl,
} from '../browser-worker/policy.mjs';

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TEXT_CHARS = 24_000;
const MAX_REDIRECTS = 3;
const MAX_BATCH_URLS = 5;
const ALLOWED_TYPES = /^(?:text\/(?:html|plain|csv|xml)|application\/(?:json|xml|xhtml\+xml))(?:\s*;|$)/i;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safeText = (value, limit = MAX_TEXT_CHARS) => String(value ?? '').slice(0, limit);

function checkOrigin(req) {
  // This candidate is machine-to-machine only. Prevent browser-based local
  // DNS rebinding requests with an Origin header, including "null".
  return !Object.hasOwn(req.headers, 'origin');
}

function authorized(req, expected) {
  const a = Buffer.from(String(req.headers.authorization || ''));
  const b = Buffer.from('Bearer ' + expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'mcp-protocol-version': '2025-03-26',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid_json');
  }
}

/** TLS verifies the original hostname; a validated public DNS address is pinned. */
export function pinnedRequest(target, publicAddress, {timeoutMs = 10000} = {}) {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http;
    let settled = false;
    let req;
    let deadline;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(value);
    };
    req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port || (target.protocol === 'https:' ? 443 : 80)),
      method: 'GET',
      path: target.pathname + target.search,
      servername: target.hostname.replace(/^\[|\]$/g, ''),
      rejectUnauthorized: true,
      lookup: (_host, options, callback) => {
        // Node 22's auto-family connector may request {all:true}; that
        // callback expects an ARRAY, not the scalar (address,family) shape.
        // Both paths remain pinned to the exact prevalidated public IP.
        if (options?.all === true) {
          return callback(null, [{address:publicAddress.address, family:publicAddress.family}]);
        }
        return callback(null, publicAddress.address, publicAddress.family);
      },
      headers: {
        'user-agent': 'EvercraftWebOwnedFetchCandidate/0.1',
        accept: 'text/html,text/plain,application/json,application/xml,text/xml,text/csv',
        'accept-encoding': 'identity',
        connection: 'close',
      },
    }, (upstream) => {
      const parts = [];
      let bytes = 0;
      const type = String(upstream.headers['content-type'] || '').trim();
      const encoding = String(upstream.headers['content-encoding'] || 'identity').toLowerCase();
      if (!([301, 302, 303, 307, 308].includes(upstream.statusCode)) &&
          (!ALLOWED_TYPES.test(type) || !['identity', ''].includes(encoding))) {
        // Drain would allow a malicious infinite response to tie up the
        // socket. Reject and close the upstream connection immediately.
        upstream.destroy();
        finish(new Error('unsupported_content_type_or_encoding'));
        return;
      }
      const lengthHeader = String(upstream.headers['content-length'] || '');
      if (/^\d+$/.test(lengthHeader) && Number(lengthHeader) > MAX_RESPONSE_BYTES) {
        upstream.destroy();
        finish(new Error('response_too_large'));
        return;
      }
      upstream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          upstream.destroy(new Error('response_too_large'));
          return;
        }
        parts.push(chunk);
      });
      upstream.on('error', (error) => finish(error));
      upstream.on('end', () => finish(null, {
        status: upstream.statusCode || 502,
        contentType: type,
        location: String(upstream.headers.location || ''),
        declaredLength: Number(upstream.headers['content-length']) || null,
        data: Buffer.concat(parts),
      }));
    });
    // req.setTimeout is an *idle* timer; a slow-drip peer could otherwise
    // hold a socket indefinitely while sending fewer than MAX_RESPONSE_BYTES.
    const wallClockMs = Math.max(100, Math.min(30_000, Math.trunc(timeoutMs) || 10_000));
    deadline = setTimeout(() => req.destroy(new Error('upstream_deadline_exceeded')), wallClockMs);
    deadline.unref?.();
    req.setTimeout(wallClockMs, () => req.destroy(new Error('upstream_timeout')));
    req.once('error', (error) => finish(error));
    req.end();
  });
}

function extractHtml(html, finalUrl) {
  const decode = (input) => safeText(String(input || '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, (v) => {
      const table = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&apos;': "'", '&nbsp;': ' ' };
      if (table[v.toLowerCase()]) return table[v.toLowerCase()];
      const hex = /^&#x/i.test(v);
      const n = Number.parseInt(v.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n) : '';
    }).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template)\s*>/gi, ' ');
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(stripped);
  const headings = [...stripped.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)]
    .slice(0, 30).map((m) => ({ level: Number(m[1]), text: decode(m[2]).slice(0, 500) }));
  const finalOrigin = new URL(finalUrl).origin;
  const metaTags = [...stripped.matchAll(/<meta\b[^>]*>/gi)].slice(0, 100);
  const descriptionTag = metaTags.map((m) => m[0]).find((tag) =>
    ['description','og:description'].includes(
      (htmlAttribute(tag, 'name') || htmlAttribute(tag, 'property')).toLowerCase()
    )
  );
  const declaredDescription = descriptionTag
    ? decode(htmlAttribute(descriptionTag,'content')).slice(0,500) : null;
  const canonicalTag = [...stripped.matchAll(/<link\b[^>]*>/gi)].slice(0,100)
    .map((m) => m[0]).find((tag) =>
      htmlAttribute(tag,'rel').toLowerCase().split(/\s+/).includes('canonical'));
  const declaredCanonical = canonicalTag
    ? boundedDeclaredLink(htmlAttribute(canonicalTag,'href'),finalUrl) : null;
  const outgoing = [];
  const seen = new Set();
  for (const match of stripped.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    const href = htmlAttribute(match[0].split('>')[0]+'>','href');
    const safeUrl = boundedDeclaredLink(href,finalUrl);
    if (!safeUrl || seen.has(safeUrl)) continue;
    if (new URL(safeUrl).origin === finalOrigin) continue;
    seen.add(safeUrl);
    outgoing.push({ url: safeUrl, text: decode(match[0]).slice(0,160) });
    if (outgoing.length >= 20) break;
  }
  const body = stripped.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ');
  return {
    title: title ? decode(title[1]).slice(0, 500) : null,
    meta_description: declaredDescription,
    declared_canonical_url: declaredCanonical,
    outbound_links: outgoing,
    outbound_links_truncated: outgoing.length === 20,
    page_metadata_verification: 'unverified_declared_by_source',
    headings,
    text: decode(body).slice(0, MAX_TEXT_CHARS),
    extraction: 'bounded_static_html_text_v2',
    javascript_rendered: false,
    final_origin: finalOrigin,
  };
}

function htmlAttribute(tag, name) {
  // Names are fixed literals chosen by the caller, not untrusted page input.
  const match = new RegExp("(?:^|\\s)" + name +
    "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
  return match ? String(match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function boundedDeclaredLink(href, base) {
  if (!href || String(href).length > 2048) return null;
  try {
    const candidate = new URL(href, base);
    if (!['https:', 'http:'].includes(candidate.protocol) ||
        candidate.username || candidate.password) return null;
    return redactUrl(candidate);
  } catch {
    return null;
  }
}

export async function fetchPublicPage(input, {
  resolveHost = resolvePublicHost,
  request = pinnedRequest,
  clock = () => new Date(),
} = {}) {
  let target = normalizePublicHttpUrl(input);
  let redirects = 0;
  const initialOrigin = target.origin;
  while (true) {
    // Validate and pin again on every hop, rejecting private/mixed DNS.
    const addresses = await resolveHost(target.hostname);
    if (!Array.isArray(addresses) || !addresses.length) throw new Error('dns_resolution_empty');
    // Fail closed if *any* resolver answer is private, even if an otherwise
    // public IPv4 address appeared first. Do not let alternate resolvers or
    // mixed A/AAAA answers weaken the original policy.
    if (addresses.some((row) => isNonPublicIp(row.address))) {
      throw new Error('private_or_reserved_target');
    }
    // Fail closed to public IPv4-only in this initial candidate. The shared
    // browser policy's IPv6 treatment needs separate mapped/NAT64 review
    // before we authorize outbound IPv6 connections.
    const publicIpv4 = addresses.find((row) =>
      row.family === 4 && !isNonPublicIp(row.address));
    if (!publicIpv4) throw new Error('ipv4_public_target_required');
    const upstream = await request(target, publicIpv4);
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      if (++redirects > MAX_REDIRECTS) throw new Error('redirect_limit_exceeded');
      if (!upstream.location) throw new Error('redirect_location_missing');
      const next = normalizePublicHttpUrl(new URL(upstream.location, target).toString());
      if (target.protocol === 'https:' && next.protocol !== 'https:') {
        throw new Error('https_downgrade_forbidden');
      }
      target = next;
      continue;
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      throw new Error('upstream_http_' + upstream.status);
    }
    if (!ALLOWED_TYPES.test(upstream.contentType || '')) {
      throw new Error('unsupported_content_type_or_encoding');
    }
    if (!Buffer.isBuffer(upstream.data) || upstream.data.length > MAX_RESPONSE_BYTES) {
      throw new Error('response_too_large');
    }
    const retrievedAt = clock().toISOString();
    const contentHash = 'sha256:' + sha256(upstream.data);
    const isHtml = /(?:html|xhtml)/i.test(upstream.contentType);
    const extracted = isHtml
      ? extractHtml(upstream.data.toString('utf8'), target.toString())
      : { text: safeText(upstream.data.toString('utf8')), title: null,
          headings: [], extraction: 'bounded_public_text_v1', javascript_rendered: false };
    const receipt = {
      evidence_state: 'observed_bounded_public_response',
      source_url_redacted: redactUrl(target),
      request_origin: initialOrigin,
      retrieved_at: retrievedAt,
      status: upstream.status,
      content_type: upstream.contentType,
      byte_count: upstream.data.length,
      content_sha256: contentHash,
      redirect_count: redirects,
    };
    return {
      ok: true,
      ...receipt,
      ...extracted,
      evidence_receipt_sha256: 'sha256:' + sha256(JSON.stringify(receipt)),
      browser_execution: false,
      authenticated_content: false,
      payment_authority: false,
    };
  }
}

export const WEB_MCP_TOOLS = Object.freeze([
  {
    name: 'get_web_capabilities',
    description: 'Describe the locally hosted read-only public web fetch candidate. Search and Browser are held.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'fetch_url',
    description: 'Fetch public HTTP(S) HTML or text with revalidated DNS and a bounded evidence receipt. No login or JavaScript execution.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Public HTTP(S) URL, without credentials.' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'fetch_urls',
    description: 'Fetch 1–5 independent public HTTP(S) URLs with per-URL isolation and bounded evidence receipts. No browser or search authority.',
    inputSchema: {
      type:'object',
      properties:{
        urls:{
          type:'array',
          items:{type:'string',description:'Public HTTP(S) URL without credentials'},
          minItems:1,
          maxItems:5,
        },
      },
      required:['urls'],
      additionalProperties:false,
    },
  },
]);

export function webMcpResponse(request, { fetcher = fetchPublicPage } = {}) {
  if (!request || request.jsonrpc !== '2.0' ||
      (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    return { jsonrpc: '2.0', id: request?.id ?? null,
      error: { code: -32600, message: 'Invalid Request' } };
  }
  if (request.method === 'notifications/initialized') return null;
  const id = request.id ?? null;
  if (request.method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: ['2025-11-25', '2025-03-26'].includes(request.params?.protocolVersion)
        ? request.params.protocolVersion : '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'evercraft-web-owned-fetch-candidate', version: '0.1.0' },
      instructions: 'Read-only public Fetch candidate. Do not use for Browser, Search, private resources, payments or production claims.',
    } };
  }
  if (request.method === 'ping') return {jsonrpc: '2.0', id, result: {}};
  if (request.method === 'tools/list') return {jsonrpc: '2.0', id, result: {tools: WEB_MCP_TOOLS}};
  if (request.method !== 'tools/call') {
    return {jsonrpc: '2.0', id, error: {code: -32601, message: 'Method not found'}};
  }
  const name = request.params?.name;
  const args = request.params?.arguments || {};
  if (name === 'get_web_capabilities') {
    const result = { mode: 'local_candidate_only',
      fetch_url: 'implemented_private_yard_tested',
      fetch_urls: 'candidate_batch_up_to_five',
      route_web_request: 'held',
      search: 'held', browser: 'held',
      authentication: 'required', external_payment_authority: false };
    return {jsonrpc: '2.0', id, result: {
      content: [{type:'text', text: JSON.stringify(result)}], structuredContent: result,
    }};
  }
  const single = name === 'fetch_url' &&
    typeof args.url === 'string' &&
    Object.keys(args).every((key) => key === 'url');
  const batch = name === 'fetch_urls' &&
    Array.isArray(args.urls) &&
    args.urls.length >= 1 && args.urls.length <= MAX_BATCH_URLS &&
    args.urls.every((url) => typeof url === 'string') &&
    Object.keys(args).every((key) => key === 'urls');
  if (!single && !batch) {
    return {jsonrpc:'2.0', id, error:{code:-32602, message:'Invalid tool arguments'}};
  }
  const run = async () => {
    if (single) return fetcher(args.url);
    const results = [];
    // Sequential retrieval avoids multiplying outbound egress concurrency
    // beyond the HTTP worker's existing global active-request budget.
    for (const [index,url] of args.urls.entries()) {
      try {
        const evidence = await fetcher(url);
        results.push({index,ok:true,evidence});
      } catch (error) {
        // No raw URL, query parameters, cookies or internal error stacks.
        results.push({index,ok:false,error:safeText(error?.message || 'fetch_failed',120)});
      }
    }
    const succeeded = results.filter((row) => row.ok).length;
    return {
      mode:'bounded_isolated_public_fetch_batch_v1',
      attempted:results.length,
      succeeded,
      failed:results.length - succeeded,
      results,
      search_authority:false,
      browser_authority:false,
      payment_authority:false,
    };
  };
  return Promise.resolve().then(run).then(
    (value) => ({jsonrpc:'2.0',id,result:{
      content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,
    }}),
    (error) => ({jsonrpc:'2.0',id,result:{
      isError:true,content:[{type:'text',text:safeText(error?.message || 'fetch_failed',120)}],
    }}),
  );
}

export async function startOwnedWebFetchMcp({
  host = '127.0.0.1',
  port = 0,
  token,
  fetcher = fetchPublicPage,
  maxConcurrent = 2,
  maxRequestsPerMinute = 60,
} = {}) {
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('loopback_only_candidate');
  if (!token || String(token).length < 24) throw new Error('private_access_token_required');
  const instanceId = 'evercraft_web_fetch_' + randomBytes(9).toString('hex');
  let deploymentReceipt = null;
  const concurrencyLimit = Math.max(1, Math.min(8, Math.trunc(maxConcurrent) || 2));
  const rateLimit = Math.max(1, Math.min(600, Math.trunc(maxRequestsPerMinute) || 60));
  let active = 0;
  let minuteStartsAt = Date.now();
  let requestsThisMinute = 0;
  const server = http.createServer(async (req,res) => {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok:true, service:'evercraft-web-owned-fetch-candidate',
        runtime:'local_only', production_ready:false, registry_repoint_authorized:false });
    }
    if (req.url !== '/mcp') return send(res, 404, {error:'not_found'});
    if (!checkOrigin(req)) return send(res, 403, {error:'browser_origin_forbidden'});
    if (!authorized(req, String(token))) return send(res, 401, {error:'unauthorized'});
    if (req.method !== 'POST') return send(res, 405, {error:'method_not_allowed'});
    const now = Date.now();
    if (now - minuteStartsAt >= 60_000) {
      minuteStartsAt = now;
      requestsThisMinute = 0;
    }
    if (++requestsThisMinute > rateLimit) {
      return send(res, 429, {error:'rate_limited', retryable:true});
    }
    if (active >= concurrencyLimit) {
      return send(res, 429, {error:'concurrency_limited', retryable:true});
    }
    active++;
    try {
      const body = await readBody(req);
      const result = await webMcpResponse(body, { fetcher });
      if (result === null) {
        res.writeHead(202, {'cache-control':'no-store'});
        res.end();
      } else {
        send(res, 200, result);
      }
    } catch(error) {
      send(res, 400, {jsonrpc:'2.0',id:null,error:{
        code:-32700,message:safeText(error?.message || 'invalid_request', 100),
      }});
    } finally {
      active--;
    }
  });
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bind_failed');
  const url = 'http://' + (host === '::1' ? '[::1]' : host) + ':' + addr.port;
  let closed = false;
  return {
    url,
    instanceId,
    // Private compute-layer invocation. Reuse this service's actual MCP HTTP
    // interface and its single concurrency/rate budget; the token stays
    // closed over in this module and never enters a Yard receipt.
    async invokeFetch(targetUrl) {
      if (closed) throw new Error('web_fetch_service_stopped');
      const response = await fetch(url + '/mcp', {
        method:'POST',
        headers:{
          authorization:'Bearer ' + token,
          'content-type':'application/json',
        },
        body:JSON.stringify({
          jsonrpc:'2.0',id:1,method:'tools/call',
          params:{name:'fetch_url',arguments:{url:String(targetUrl || '')}},
        }),
        signal:AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? 'web_fetch_capacity_limited' : 'web_fetch_internal_call_failed');
      }
      const body = await response.json();
      if (body.result?.isError === true) {
        throw new Error(String(body.result?.content?.[0]?.text || 'web_fetch_rejected').slice(0,120));
      }
      if (body.result?.structuredContent?.ok !== true) {
        throw new Error('web_fetch_evidence_missing');
      }
      return body.result.structuredContent;
    },
    health: () => ({
      ok: !closed,
      service: 'evercraft-web-owned-fetch-candidate',
      runtime: 'Evercraft Compute',
      instance_id: instanceId,
      mode: 'authenticated_read_only',
      loopback_only: true,
      public_route_approved: false,
      registry_repoint_authorized: false,
      payment_authority: false,
      deployment_receipt_bound: Boolean(deploymentReceipt),
      deployment_receipt_ref: deploymentReceipt,
    }),
    setDeploymentReceipt: (value) => {
      const ref = String(value || '');
      if (!/^[a-f0-9]{64}$/i.test(ref)) throw new Error('invalid_deployment_receipt_ref');
      deploymentReceipt = ref;
      return {ok: true, deployment_receipt_bound: true, receipt_hash: ref};
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startOwnedWebFetchMcp({
    token: process.env.EVERCRAFT_WEB_MCP_ACCESS_TOKEN,
    port: Number(process.env.EVERCRAFT_WEB_MCP_PORT || 8791),
  }).then(({url}) => {
    process.stdout.write('Evercraft Web local-only MCP listening: ' + url + '\n');
  }).catch((error) => {
    process.stderr.write('Evercraft Web local candidate held: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
