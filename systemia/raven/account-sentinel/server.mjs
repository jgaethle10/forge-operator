import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEMO_SCENARIOS, runDemoScenario } from './demo.mjs';

const address = '127.0.0.1'; // Deliberately local only.
const port = Number(process.env.ACCOUNT_SENTINEL_DEMO_PORT || 8776);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('invalid_demo_port');
}
const root = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(root, 'dashboard.html'));
const reply = (res, status, body, type='application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'" });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};
const server = createServer(async (req, res) => {
  if (req.headers.host !== `${address}:${port}` && req.headers.host !== `localhost:${port}`) {
    return reply(res, 403, { error: 'invalid_host' });
  }
  if (req.method === 'GET' && req.url === '/') {
    return reply(res, 200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/api/scenarios') {
    return reply(res, 200, { simulation_only: true, scenarios: DEMO_SCENARIOS });
  }
  if (req.method === 'GET' && req.url === '/health') {
    return reply(res, 200, { service: 'account-sentinel-demo', status: 'simulation_only',
      real_bank_connections: 0, payment_permissions: 0 });
  }
  if (req.method === 'POST' && req.url === '/api/run') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${address}:${port}` && origin !== `http://localhost:${port}`) {
      return reply(res, 403, { error: 'invalid_origin' });
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return reply(res, 415, { error: 'json_required' });
    }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1024) return reply(res, 413, { error: 'body_too_large' });
      }
      const input = JSON.parse(raw);
      if (!input || Object.keys(input).sort().join('|') !== 'scenario' ||
          typeof input.scenario !== 'string' ||
          !DEMO_SCENARIOS.some(s => s.id === input.scenario)) {
        return reply(res, 400, { error: 'invalid_simulation_selection' });
      }
      return reply(res, 200, await runDemoScenario(input.scenario));
    } catch {
      return reply(res, 400, { error: 'invalid_simulation_request' });
    }
  }
  return reply(res, 404, { error: 'not_found' });
});
server.listen(port, address, () => {
  process.stdout.write(`Account Sentinel SIMULATION: http://${address}:${port}\n`);
});
