import http from 'node:http';
import net from 'node:net';
import {
  normalizePublicHttpUrl,
  resolvePublicHost
} from './policy.mjs';

const SAFE_METHODS = new Set(['GET','HEAD','OPTIONS']);
const CONNECT_TIMEOUT_MS = 15000;

function stripSensitiveHeaders(headers = {}) {
  const out = {};
  for (const [key,value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (['cookie','authorization','proxy-authorization','proxy-connection'].includes(lower)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeResponseHeaders(headers = {}) {
  const out = {...headers};
  delete out['set-cookie'];
  delete out['set-cookie2'];
  return out;
}

function connectAddress(address, family, port) {
  return new Promise((resolve,reject) => {
    const socket = net.connect({host:address,family,port});
    const cleanup = () => socket.removeAllListeners('error');
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error('connect_timeout'));
    });
    socket.once('connect', () => {
      cleanup();
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

async function connectAny(addresses, port) {
  let lastError = null;
  for (const row of addresses) {
    try {
      return await connectAddress(row.address,row.family,port);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('connect_failed');
}

function parseConnectTarget(value) {
  const raw = String(value || '').trim();
  const url = new URL(`http://${raw}`);
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  const port = Number(url.port || 443);
  if (!hostname) throw new Error('missing_hostname');
  if (port !== 443) throw new Error('unsupported_port');
  return {hostname,port};
}

export async function createSecureOutboundProxy() {
  const server = http.createServer(async (req,res) => {
    try {
      const method = String(req.method || 'GET').toUpperCase();
      if (!SAFE_METHODS.has(method)) {
        res.writeHead(405,{'content-type':'text/plain'});
        res.end('method_not_allowed');
        return;
      }

      const target = normalizePublicHttpUrl(req.url);
      if (target.protocol !== 'http:') {
        res.writeHead(400,{'content-type':'text/plain'});
        res.end('https_requires_connect');
        return;
      }

      const addresses = await resolvePublicHost(target.hostname);
      const selected = addresses[0];
      const headers = stripSensitiveHeaders(req.headers);
      headers.host = target.host;

      const upstream = http.request({
        host:selected.address,
        family:selected.family,
        port:80,
        method,
        path:target.pathname + target.search,
        headers
      }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, sanitizeResponseHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
      });

      upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy(new Error('upstream_timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502,{'content-type':'text/plain'});
        res.end('upstream_error');
      });
      req.pipe(upstream);
    } catch (error) {
      res.writeHead(403,{'content-type':'text/plain'});
      res.end(error instanceof Error ? error.message : 'proxy_denied');
    }
  });

  server.on('connect', async (req,clientSocket,head) => {
    try {
      const {hostname,port} = parseConnectTarget(req.url);
      const addresses = await resolvePublicHost(hostname);
      const upstreamSocket = await connectAny(addresses,port);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\nConnection: keep-alive\r\n\r\n');
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
      const destroyBoth = () => {
        upstreamSocket.destroy();
        clientSocket.destroy();
      };
      upstreamSocket.on('error',destroyBoth);
      clientSocket.on('error',destroyBoth);
    } catch {
      clientSocket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      clientSocket.destroy();
    }
  });

  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('proxy_bind_failed');

  return {
    url:`http://127.0.0.1:${address.port}`,
    close:() => new Promise((resolve) => server.close(resolve))
  };
}
