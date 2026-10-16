#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeGraphicsMcpRpc } from './graphics-department.mjs';

const MAX_BODY_BYTES = 128 * 1024;
const CONTENT_TYPE = 'application/json; charset=utf-8';

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': CONTENT_TYPE,
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'mcp-protocol-version': '2025-03-26',
  });
  res.end(body);
}
function secureEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createGraphicsMcpServer({ token } = {}) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('graphics_mcp_token_missing_or_short');
  }
  return http.createServer(async (req, res) => {
    try {
      // RC001 is for native local clients only. Reject browser Origins rather
      // than exposing a CORS surface or risking DNS rebinding.
      if (req.headers.origin !== undefined) {
        return json(res, 403, { error: 'browser_origin_not_allowed' });
      }
      let host;
      try { host = new URL('http://' + String(req.headers.host || '')).hostname.toLowerCase(); }
      catch { return json(res, 403, { error: 'invalid_host_rejected' }); }
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
        return json(res, 403, { error: 'non_loopback_host_rejected' });
      }
      if (!secureEqual(req.headers.authorization, 'Bearer ' + token)) {
        return json(res, 401, { error: 'unauthorized' });
      }
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname === '/healthz' && req.method === 'GET') {
        return json(res, 200, { ok: true, service: 'evercraft-graphics-preview', mode: 'private_preview_only' });
      }
      if (pathname !== '/mcp/graphics') return json(res, 404, { error: 'not_found' });
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
        return res.end();
      }
      const protocol = req.headers['mcp-protocol-version'];
      if (protocol !== undefined && protocol !== '2025-03-26') {
        return json(res, 400, { error: 'unsupported_mcp_protocol_version', supported: ['2025-03-26'] });
      }
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return json(res, 415, { error: 'application_json_required' });
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return json(res, 413, { error: 'request_too_large' });
        chunks.push(chunk);
      }
      let request;
      try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      const response = executeGraphicsMcpRpc(request);
      if (response === null) {
        res.writeHead(202, { 'cache-control': 'no-store' });
        return res.end();
      }
      json(res, 200, response);
    } catch {
      json(res, 500, { error: 'graphics_preview_internal_error' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const token = process.env.EVERCRAFT_GRAPHICS_MCP_TOKEN;
  const host = process.env.EVERCRAFT_GRAPHICS_MCP_HOST || '127.0.0.1';
  const port = Number(process.env.EVERCRAFT_GRAPHICS_MCP_PORT || '8766');
  if (!['127.0.0.1', '::1'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('graphics_mcp_localhost_only');
  }
  const server = createGraphicsMcpServer({ token });
  server.listen(port, host, () => {
    process.stdout.write('Evercraft Graphics MCP private preview listening on ' + host + ':' + port + '\n');
  });
}
