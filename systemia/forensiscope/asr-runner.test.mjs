import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { resolveAsrProvider, transcribeWithProvider } from './asr-runner.mjs';

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


test('Gemini ASR auto-selects from GEMINI_API_KEY and normalizes speaker word annotations', async () => {
  const fixture = wavFixture();
  const calls = [];
  const deleted = [];
  const fakeClient = {
    files: {
      async upload(request) {
        calls.push({ type: 'upload', request });
        return {
          name: 'files/fixture',
          uri: 'https://example.invalid/files/fixture',
          mimeType: 'audio/wav'
        };
      },
      async delete(request) {
        deleted.push(request);
      }
    },
    interactions: {
      async create(request) {
        calls.push({ type: 'interaction', request });
        return {
          output_text: 'Hello world Yes',
          steps: [{
            content: [{
              annotations: [
                { type: 'word_info', text: 'Hello', speaker: 'spk_1', start_offset: '0.100s', end_offset: '0.450s' },
                { type: 'word_info', text: 'world', speaker: 'spk_1', start_offset: '0.500s', end_offset: '0.850s' },
                { type: 'word_info', text: 'Yes', speaker: 'spk_2', start_offset: '1.100s', end_offset: '1.350s' }
              ]
            }]
          }]
        };
      }
    }
  };

  try {
    const env = { GEMINI_API_KEY: 'gemini-test-key' };
    const config = resolveAsrProvider(env);
    assert.equal(config.provider, 'gemini');
    assert.equal(config.model, 'gemini-3.5-transcribe');

    const result = await transcribeWithProvider({
      inputPath: fixture.file,
      durationSeconds: 2,
      env,
      geminiClient: fakeClient
    });

    assert.equal(result.engine_id, 'gemini:gemini-3.5-transcribe');
    assert.deepEqual(result.segments, [
      { start: 0.1, end: 0.85, text: 'Hello world', speaker: 'spk_1' },
      { start: 1.1, end: 1.35, text: 'Yes', speaker: 'spk_2' }
    ]);

    const interaction = calls.find((entry) => entry.type === 'interaction')?.request;
    assert.equal(interaction.model, 'gemini-3.5-transcribe');
    assert.equal(
      interaction.generation_config.transcription_config.mode.diarization_mode,
      'speaker'
    );
    assert.deepEqual(
      interaction.generation_config.transcription_config.mode.timestamp_granularities,
      ['word']
    );
    assert.deepEqual(deleted, [{ name: 'files/fixture' }]);
  } finally {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('Gemini ASR falls back to full transcript text when annotations are absent', async () => {
  const fixture = wavFixture();
  const fakeClient = {
    files: {
      async upload() {
        return {
          uri: 'https://example.invalid/files/fixture',
          mimeType: 'audio/wav'
        };
      }
    },
    interactions: {
      async create() {
        return { output_text: 'Fallback transcript' };
      }
    }
  };

  try {
    const result = await transcribeWithProvider({
      inputPath: fixture.file,
      durationSeconds: 9.25,
      env: {
        FORENSISCOPE_ASR_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-test-key'
      },
      geminiClient: fakeClient
    });
    assert.deepEqual(result.segments, [{
      start: 0,
      end: 9.25,
      text: 'Fallback transcript',
      speaker: null
    }]);
  } finally {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
});
