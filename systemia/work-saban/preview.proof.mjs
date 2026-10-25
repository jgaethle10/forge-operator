import assert from 'node:assert/strict';
import http from 'node:http';
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
    method:'POST', ...extra, headers:{...headers,...(extra.headers||{})},
    body:JSON.stringify({task}),
  });
  const result = await post('Analyze the quarterly sales spreadsheet and prepare slides');
  assert.equal(result.status, 200);
  const proposal = (await result.json()).mission;
  assert(proposal.team.some(role => role.id === 'analyst'));
  assert(proposal.team.some(role => role.id === 'designer'));
  assert.equal(proposal.state, 'proposed_not_admitted');
  assert.equal((await post('x')).status, 400);
  assert.equal((await post('Write an office email', {headers:{origin:'https://untrusted.example'}})).status, 403);
  const demoResponse = await fetch(`${base}/api/run-demo`, {method:'POST',headers:{'x-work-saban-client':'local-preview'}});
  assert.equal(demoResponse.status, 200);
  const demo = await demoResponse.json();
  assert.equal(demo.fixture, 'synthetic_demo_only');
  assert.equal(demo.execution.status, 'verified_local');
  assert.equal(demo.execution.specialist_receipts.length, 5);
  assert.equal(demo.execution.model_inference, false);
  assert.equal((await fetch(`${base}/api/run-demo`,{method:'POST'})).status,403);
  const csv = 'month,revenue\n2026-08,100.10\n2026-09,90.05\n';
  const postCsv = (payload, moreHeaders = {}) => fetch(base + '/api/run-csv', {
    method: 'POST',
    headers: {...headers, ...moreHeaders},
    body: JSON.stringify(payload)
  });
  const chosenFile = { filename:'my-sales.csv', csv_text:csv };
  assert.equal((await postCsv(chosenFile)).status, 403, 'must opt in to one local read');
  assert.equal((await postCsv({...chosenFile, local_file_read_approved:true}, {origin:'https://bad.example'})).status, 403);
  assert.equal((await postCsv({...chosenFile, filename:'../secrets.csv', local_file_read_approved:true})).status, 400);
  assert.equal((await postCsv({...chosenFile, filename:'notes.txt', local_file_read_approved:true})).status, 400);
  assert.equal((await postCsv({...chosenFile, csv_text:'month,revenue\nbad,100\n2026-09,10', local_file_read_approved:true})).status, 400);
  assert.equal((await postCsv({...chosenFile, csv_text:'x'.repeat(256 * 1024 + 1), local_file_read_approved:true})).status, 413);
  const approved = await postCsv({...chosenFile, local_file_read_approved:true});
  assert.equal(approved.status, 200, 'one explicit file should be processed');
  const finished = await approved.json();
  assert.equal(finished.input_source, 'explicit_browser_csv');
  assert.equal(finished.output_destination, 'http_response_only');
  assert.equal(finished.retention, 'not_saved_by_preview');
  assert.equal(finished.execution.status, 'verified_local');
  assert.equal(finished.execution.revenue_analysis.change_cents, '-1005');
  assert.equal(finished.execution.specialist_receipts.length, 5);
  assert.equal(finished.execution.quality.status, 'verified');
  assert.equal(finished.execution.external_actions.length, 0);
  assert.equal(finished.execution.model_inference, false);
  const rebindingStatus = await new Promise((resolve,reject) => {
    const request = http.request({
      host:'127.0.0.1', port:address.port, method:'GET', path:'/health',
      headers:{host:'evil.example'}
    }, response => { response.resume(); response.on('end',()=>resolve(response.statusCode)); });
    request.on('error',reject);
    request.end();
  });
  assert.equal(rebindingStatus, 403, 'untrusted Host rejected');
  const denied = await fetch(`${base}/api/compose`, {
    method:'POST',headers:{'content-type':'text/plain'},body:'oops'
  });
  assert.equal(denied.status, 415);
  console.log('Work Saban preview API proof: PASS (local-only formation, synthetic demo, consented CSV, hostname and size guards).');
} finally {
  await new Promise(resolve => server.close(resolve));
}
