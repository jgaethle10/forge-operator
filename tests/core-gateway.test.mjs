import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startCoreGateway } from '../systemia/core/core-gateway.mjs';

test('Evercraft Core Gateway replaces shared integration calls without legacy transport', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-core-'));
  const seen = [];
  const runtime = await startCoreGateway({
    port: 0,
    config: {
      uploadRoot,
      uploadPublicBase: 'https://assets.example.test/core',
      corsOrigin: '',
      adapterSecret: '',
      adapterUrls: {},
    },
    adapters: {
      invoke_llm: async (payload) => {
        seen.push(['invoke_llm', payload]);
        return 'owned-model-result';
      },
      send_email: async (payload) => {
        seen.push(['send_email', payload]);
        return { accepted: true };
      },
      send_sms: async (payload) => {
        seen.push(['send_sms', payload]);
        return { accepted: true };
      },
      generate_image: async (payload) => {
        seen.push(['generate_image', payload]);
        return { url: 'https://assets.example.test/generated.png' };
      },
    },
  });

  try {
    const health = await fetch(runtime.url + '/api/core/health').then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.runtime_owner, 'evercraft');
    assert.equal(health.legacy_provider_transport, false);
    assert.equal(health.configured_adapters.invoke_llm, true);

    const llm = await fetch(runtime.url + '/api/core/invoke-llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    }).then((r) => r.json());
    assert.equal(llm.value, 'owned-model-result');

    const upload = await fetch(runtime.url + '/api/core/upload-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'proof.txt',
        mime_type: 'text/plain',
        data_base64: Buffer.from('evercraft').toString('base64'),
      }),
    }).then((r) => r.json());
    assert.equal(upload.value.bytes, 9);
    assert.match(upload.value.sha256, /^[a-f0-9]{64}$/);
    assert.match(upload.value.file_url, /^https:\/\/assets\.example\.test\/core\//);
    assert.equal(fs.readFileSync(path.join(uploadRoot, upload.value.filename), 'utf8'), 'evercraft');

    const extracted = await fetch(runtime.url + '/api/core/extract-data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'rows.csv',
        text: 'name,value\nA,1\nB,2\n',
      }),
    }).then((r) => r.json());
    assert.deepEqual(extracted.value.data, [
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ]);

    const mail = await fetch(runtime.url + '/api/core/send-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'test@example.com', subject: 'proof' }),
    }).then((r) => r.json());
    assert.equal(mail.value.accepted, true);
    assert.equal(seen.some(([operation]) => operation === 'send_email'), true);
  } finally {
    await runtime.close();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
});
