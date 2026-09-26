import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { transcribeWithProvider } from './asr-runner.mjs';

function wavFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-asr-'));
  const file = path.join(dir, 'fixture.wav');
  fs.writeFileSync(file, Buffer.from('RIFF0000WAVEfmt '));
  return { dir, file };
}

test('managed ASR normalizes diarized timestamp segments', async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/audio/transcriptions');
    assert.equal(req.headers.authorization, 'Bearer test-key');
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        duration: 4.2,
        text: 'hello world',
        segments: [
          { start: 0, end: 1.2, text: 'hello', speaker: 'A' },
          { start: 1.2, end: 4.2, text: 'world', speaker: 'B' }
        ]
      }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const fixture = wavFixture();

  try {
    const result = await transcribeWithProvider({
      inputPath: fixture.file,
      durationSeconds: 4.2,
      env: {
        FORENSISCOPE_ASR_PROVIDER: 'openai-compatible',
        FORENSISCOPE_ASR_API_KEY: 'test-key',
        FORENSISCOPE_ASR_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        FORENSISCOPE_ASR_MODEL: 'gpt-4o-transcribe-diarize'
      }
    });

    assert.equal(result.engine_id, 'openai-compatible:gpt-4o-transcribe-diarize');
    assert.deepEqual(result.segments, [
      { start: 0, end: 1.2, text: 'hello', speaker: 'A' },
      { start: 1.2, end: 4.2, text: 'world', speaker: 'B' }
    ]);
  } finally {
    server.close();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('managed ASR falls back to one timed segment for text-only JSON', async () => {
  const fixture = wavFixture();
  try {
    const result = await transcribeWithProvider({
      inputPath: fixture.file,
      durationSeconds: 7.5,
      env: {
        FORENSISCOPE_ASR_PROVIDER: 'openai-compatible',
        FORENSISCOPE_ASR_API_KEY: 'test-key'
      },
      fetchImpl: async () => new Response(JSON.stringify({ text: 'single block' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    });
    assert.deepEqual(result.segments, [{ start: 0, end: 7.5, text: 'single block' }]);
  } finally {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
});
