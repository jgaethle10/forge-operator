import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWorkSabanMission } from './mission.mjs';
import { executeLocalSalesReport } from './execute-local.mjs';
import { MAX_CSV_BYTES, parseSalesCsv } from './csv-core.mjs';
import { createLocalEventChain } from './trace-chain.mjs';
import { capacityView } from './capacity-model.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const syntheticCsv = fs.readFileSync(path.join(root, 'fixtures/monthly-sales-demo.csv'), 'utf8');

async function readJsonBounded(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('request_too_large');
      error.httpStatus = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.httpStatus = 400;
    throw error;
  }
}

function reply(res, code, data) {
  const bytes = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': bytes.length, 'x-content-type-options': 'nosniff' });
  res.end(bytes);
}

export async function startWorkSabanPreview({ host = '127.0.0.1', port = 0 } = {}) {
  if (host !== '127.0.0.1') throw new Error('preview_must_bind_loopback');
  const server = http.createServer(async (req, res) => {
    const hostHeader = String(req.headers.host || '');
    const match = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(hostHeader);
    if (!match || Number(match[2]) !== server.address()?.port) {
      return reply(res, 403, {ok:false,error:'local_host_required'});
    }
    res.setHeader('content-security-policy', "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.method === 'GET' && req.url === '/api/capacity') return reply(res, 200, {ok:true,source:'local_preview',execution_mode:'synthetic_demo_only',capacity:capacityView(),live_workers:false});
    if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok:true, service:'work-saban-preview', live_workers:false, customer_execution:false });
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(page);
    }
    if (req.method === 'GET' && ['/style.css', '/app.js', '/office.js', '/office-3d.js', '/trace-client.js', '/office-floor.svg'].includes(req.url)) {
      const filename=req.url.slice(1);
      const mime=filename.endsWith('.css') ? 'text/css; charset=utf-8' : filename.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : 'text/javascript; charset=utf-8';
      res.writeHead(200, {'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff'});
      return res.end(fs.readFileSync(path.join(root,filename)));
    }
    if (req.method === 'POST' && req.url === '/api/run-demo-stream') {
      if (req.headers['x-work-saban-client'] !== 'local-preview') {
        return reply(res, 403, {ok:false,error:'local_preview_header_required'});
      }
      if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
        return reply(res,403,{ok:false,error:'cross_origin_forbidden'});
      }
      res.writeHead(200, {
        'content-type':'application/x-ndjson; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'
      });
      const chain = createLocalEventChain();
      const emit = item => {
        if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(chain.next(item)) + '\n');
      };
      emit({schema:'evercraft.work-saban.local-stream.v1',type:'accepted',source:'synthetic_fixture',status:'running_local'});
      try {
        const execution=await executeLocalSalesReport({
          csvText:syntheticCsv,localFileReadApproved:true,
          beforeStage:row=>emit({type:'stage_started',role:row.role}),
          afterStage:row=>emit({type:'stage_verified',role:row.role,receipt:row})
        });
        emit({type:'completed',source:'synthetic_fixture',execution,retention:'not_saved_by_preview'});
      } catch {
        emit({type:'failed_closed',error:'demo_execution_not_verified'});
      } finally {
        res.end();
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/run-demo') {
      if (req.headers['x-work-saban-client'] !== 'local-preview') return reply(res, 403, {ok:false,error:'local_preview_header_required'});
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(res, 403, {ok:false,error:'cross_origin_forbidden'});
      try {
        const execution = await executeLocalSalesReport({csvText:syntheticCsv,localFileReadApproved:true});
        return reply(res,200,{ok:true,fixture:'synthetic_demo_only',execution});
      } catch {
        return reply(res,503,{ok:false,error:'demo_execution_not_verified'});
      }
    }
    if (req.method === 'POST' && req.url === '/api/run-csv-stream') {
      if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json'
          || req.headers['x-work-saban-client'] !== 'local-preview') {
        return reply(res, 415, {ok:false,error:'json_local_preview_required'});
      }
      if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
        return reply(res, 403, {ok:false,error:'cross_origin_forbidden'});
      }
      let payload;
      try {
        payload = await readJsonBounded(req, MAX_CSV_BYTES + 4096);
        if (payload?.local_file_read_approved !== true) {
          return reply(res, 403, {ok:false,error:'explicit_local_file_consent_required'});
        }
        if (typeof payload.filename !== 'string' || payload.filename.length > 180
            || !/^[^/\\\u0000-\u001f]+\.csv$/i.test(payload.filename)) {
          return reply(res, 400, {ok:false,error:'safe_csv_filename_required'});
        }
        if (typeof payload.csv_text !== 'string'
            || Buffer.byteLength(payload.csv_text, 'utf8') > MAX_CSV_BYTES) {
          return reply(res, 413, {ok:false,error:'csv_too_large'});
        }
        parseSalesCsv(payload.csv_text);
      } catch (error) {
        const status = error.httpStatus || (String(error.message).startsWith('csv_') ? 400 : 503);
        return reply(res, status, {ok:false,error:status === 503 ? 'csv_execution_failed_closed' : error.message});
      }
      res.writeHead(200, {
        'content-type':'application/x-ndjson; charset=utf-8',
        'cache-control':'no-store',
        'x-content-type-options':'nosniff',
      });
      const chain = createLocalEventChain();
      const emit = item => {
        if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(chain.next(item)) + '\n');
      };
      emit({schema:'evercraft.work-saban.local-stream.v1',type:'accepted',status:'running_local'});
      try {
        const execution = await executeLocalSalesReport({
          csvText:payload.csv_text,
          localFileReadApproved:true,
          beforeStage:row => emit({type:'stage_started',role:row.role}),
          afterStage:row => emit({type:'stage_verified',role:row.role,receipt:row}),
        });
        emit({type:'completed',execution,retention:'not_saved_by_preview'});
      } catch {
        emit({type:'failed_closed',error:'stage_execution_not_verified'});
      } finally {
        res.end();
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/run-csv') {
      if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json'
          || req.headers['x-work-saban-client'] !== 'local-preview') {
        return reply(res, 415, {ok:false,error:'json_local_preview_required'});
      }
      if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
        return reply(res, 403, {ok:false,error:'cross_origin_forbidden'});
      }
      try {
        const payload = await readJsonBounded(req, MAX_CSV_BYTES + 4096);
        if (payload?.local_file_read_approved !== true) {
          return reply(res, 403, {ok:false,error:'explicit_local_file_consent_required'});
        }
        if (typeof payload?.filename !== 'string' || payload.filename.length > 180
            || !/^[^/\\\u0000-\u001f]+\.csv$/i.test(payload.filename)) {
          return reply(res, 400, {ok:false,error:'safe_csv_filename_required'});
        }
        if (typeof payload.csv_text !== 'string'
            || Buffer.byteLength(payload.csv_text, 'utf8') > MAX_CSV_BYTES) {
          return reply(res, 413, {ok:false,error:'csv_too_large'});
        }
        const execution = await executeLocalSalesReport({
          csvText: payload.csv_text, localFileReadApproved: true
        });
        return reply(res, 200, {
          ok:true, input_source:'explicit_browser_csv',
          output_destination:'http_response_only',
          retention:'not_saved_by_preview',
          execution
        });
      } catch (error) {
        const safeCode = String(error.message || 'csv_run_failed');
        const status = error.httpStatus || (safeCode.startsWith('csv_') ? 400 : 503);
        return reply(res, status, {ok:false,error:status === 503 ? 'csv_execution_failed_closed' : safeCode});
      }
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
