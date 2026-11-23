import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.EVERCRAFT_DEMAND_DESK_PORT || '8797');
const origin = 'http://' + host + ':' + port;
const directory = process.env.EVERCRAFT_DEMAND_DESK_STATE ||
  join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'evercraft', 'demand-desk');
const workspacePath = join(directory, 'workspace.json');
const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .replace('<html lang="en">', '<html lang="en" data-storage="owned">');
const maxBytes = 8 * 1024 * 1024;
mkdirSync(directory, { recursive: true, mode: 0o700 });
let workspace = { revision: 0, data: null };
try {
  workspace = JSON.parse(readFileSync(workspacePath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function queue() {
  const closed = new Set(['Won', 'Closed', 'Lost']);
  const oldest = row => [row.due, row.deadline].filter(Boolean).sort()[0] || '9999-12-31';
  const verified = row => Boolean(row.verified && row.verifiedOn && row.signal?.trim());
  const next = row => row.next || (!verified(row) ? 'Verify the source' :
    !row.buyer || !row.research ? 'Research the buyer' : !row.offer ? 'Define the offer' :
    !row.draft ? 'Write personalized outreach' :
    row.events.some(event => event.type === 'Sent') ? 'Review replies and set follow-up' : 'Review outreach draft');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const records = (workspace.data?.records || []).filter(row => !closed.has(row.status))
    .sort((a, b) => Number(oldest(a) > today) - Number(oldest(b) > today) ||
      Number(verified(b)) - Number(verified(a)) || oldest(a).localeCompare(oldest(b)) ||
      Number(b.value || 0) - Number(a.value || 0));
  return {
    schema: 1, kind: 'evercraft.demand-desk.queue', revision: workspace.revision,
    opportunities: records.map(row => ({
      id: row.id, business: row.business, owner: row.owner, product: row.product,
      status: row.status, verified: verified(row), action: next(row),
      followUp: row.due, deadline: row.deadline
    }))
  };
}

function valid(data) {
  return data?.schema === 1 && Array.isArray(data.records) && Array.isArray(data.patterns) &&
    data.records.every(row => typeof row?.id === 'string' && typeof row.business === 'string' &&
      ['signal', 'due', 'deadline'].every(key => row[key] == null || typeof row[key] === 'string') &&
      Array.isArray(row.events) && row.events.every(event => typeof event?.type === 'string' &&
        typeof event.body === 'string')) &&
    new Set(data.records.map(row => row.id)).size === data.records.length &&
    data.patterns.every(pattern => typeof pattern?.id === 'string' &&
      typeof pattern.name === 'string' && typeof pattern.product === 'string' &&
      typeof pattern.scope === 'string');
}

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
  const json = (status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  if (request.headers.host !== host + ':' + port ||
      (request.headers.origin && request.headers.origin !== origin)) {
    return json(403, { error: 'Loopback origin required' });
  }
  if (request.method === 'GET') {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }
    if (request.url === '/health') return json(200, { ok: true, revision: workspace.revision });
    if (request.url === '/api/workspace') return json(200, workspace);
    if (request.url === '/api/systemia/queue') return json(200, queue());
  }
  if (request.method !== 'PUT' || request.url !== '/api/workspace') {
    return json(404, { error: 'Unknown route' });
  }
  if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') {
    return json(403, { error: 'Same-origin JSON required' });
  }
  let data;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) return json(413, { error: 'Workspace exceeds size limit' });
      chunks.push(chunk);
    }
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!valid(data)) return json(422, { error: 'Invalid workspace' });
  if (request.headers['if-match'] !== String(workspace.revision)) {
    return json(409, { error: 'Workspace revision changed' });
  }
  const updated = { revision: workspace.revision + 1, data };
  try {
    writeFileSync(workspacePath + '.tmp', JSON.stringify(updated), { mode: 0o600, flush: true });
    renameSync(workspacePath + '.tmp', workspacePath);
    workspace = updated;
    return json(200, { revision: workspace.revision });
  } catch {
    return json(500, { error: 'Workspace write failed' });
  }
}).listen(port, host, () => console.log('Evercraft Demand Desk listening on ' + origin));
