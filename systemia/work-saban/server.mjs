import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWorkSabanMission } from './mission.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function reply(res, code, data) {
  const bytes = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': bytes.length, 'x-content-type-options': 'nosniff' });
  res.end(bytes);
}

export async function startWorkSabanPreview({ host = '127.0.0.1', port = 0 } = {}) {
  if (host !== '127.0.0.1') throw new Error('preview_must_bind_loopback');
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-security-policy', "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok:true, service:'work-saban-preview', live_workers:false, customer_execution:false });
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(page);
    }
    if (req.method === 'GET' && ['/style.css', '/app.js'].includes(req.url)) {
      const filename=req.url.slice(1);
      const mime=filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
      res.writeHead(200, {'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff'});
      return res.end(fs.readFileSync(path.join(root,filename)));
    }
    if (req.method !== 'POST' || req.url !== '/api/compose') return reply(res, 404, {ok:false,error:'not_found'});
    if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json' || req.headers['x-work-saban-client'] !== 'local-preview') return reply(res, 415, {ok:false,error:'json_local_preview_required'});
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return reply(res, 403, {ok:false,error:'cross_origin_forbidden'});
    try {
      const chunks=[];
      let size=0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16 * 1024) return reply(res, 413, {ok:false,error:'request_too_large'});
        chunks.push(chunk);
      }
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return reply(res, 200, {ok:true, mission:composeWorkSabanMission(payload)});
    } catch (error) {
      return reply(res, 400, {ok:false,error:error.message || 'invalid_request'});
    }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORK_SABAN_PORT || 8789);
  startWorkSabanPreview({ port }).then(() => {
    console.log(`Work Saban formation preview: http://127.0.0.1:${port} (local only; no worker execution)`);
  }).catch(error => { console.error(error.message); process.exitCode=1; });
}
