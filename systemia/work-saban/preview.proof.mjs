import assert from 'node:assert/strict';
import { startWorkSabanPreview } from './server.mjs';

const server = await startWorkSabanPreview();
try {
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.live_workers, false);
  for (const endpoint of ['/', '/app.js', '/style.css']) {
    const response = await fetch(`${base}${endpoint}`);
    assert.equal(response.status, 200, endpoint);
    assert((await response.text()).length > 100);
  }
  const headers = {'content-type':'application/json','x-work-saban-client':'local-preview'};
  const post = (task,extra={}) => fetch(`${base}/api/compose`, {
    method:'POST', headers:{...headers,...(extra.headers||{})},
    body:JSON.stringify({task}), ...extra,
  });
  const result = await post('Analyze the quarterly sales spreadsheet and prepare slides');
  assert.equal(result.status, 200);
  const proposal = (await result.json()).mission;
  assert(proposal.team.some(role => role.id === 'analyst'));
  assert(proposal.team.some(role => role.id === 'designer'));
  assert.equal(proposal.state, 'proposed_not_admitted');
  assert.equal((await post('x')).status, 400);
  assert.equal((await post('Write an office email', {headers:{origin:'https://untrusted.example'}})).status, 403);
  const denied = await fetch(`${base}/api/compose`, {
    method:'POST',headers:{'content-type':'text/plain'},body:'oops'
  });
  assert.equal(denied.status, 415);
  console.log('Work Saban preview API proof: PASS (local only, proposal only).');
} finally {
  await new Promise(resolve => server.close(resolve));
}
