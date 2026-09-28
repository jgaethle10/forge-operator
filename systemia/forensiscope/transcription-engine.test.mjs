import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTranscriptionEngine,
  transcriptionCapabilityStatus
} from './transcription-engine.mjs';

test('managed ASR advertises a ready transcription capability without remote traffic', () => {
  const env = {
    FORENSISCOPE_ASR_PROVIDER: 'openai',
    FORENSISCOPE_ASR_API_KEY: 'test-key',
    FORENSISCOPE_ASR_MODEL: 'gpt-4o-transcribe-diarize'
  };
  const engine = resolveTranscriptionEngine(env);
  assert.equal(engine.state, 'configured');
  assert.equal(engine.engine_id, 'openai:gpt-4o-transcribe-diarize');

  const capability = transcriptionCapabilityStatus({ env });
  assert.equal(capability.ready, true);
  assert.equal(capability.state, 'configured');
  assert.equal(capability.probe_state, 'ready');
});

test('legacy executable ASR still advertises a ready transcription capability', () => {
  const env = {
    FORENSISCOPE_TRANSCRIBE_ENABLED: 'true',
    FORENSISCOPE_TRANSCRIBE_ENGINE_ID: 'private-fixture',
    FORENSISCOPE_TRANSCRIBE_EXECUTABLE: process.execPath,
    FORENSISCOPE_TRANSCRIBE_ARGS_JSON: '["-e","process.exit(0)"]'
  };
  const capability = transcriptionCapabilityStatus({ env });
  assert.equal(capability.ready, true);
  assert.equal(capability.engine_id, 'private-fixture');
  assert.equal(capability.probe_state, 'configuration_only');
});

test('managed ASR without a key cannot advertise transcription capacity', () => {
  const capability = transcriptionCapabilityStatus({
    env: { FORENSISCOPE_ASR_PROVIDER: 'openai' }
  });
  assert.equal(capability.ready, false);
  assert.equal(capability.state, 'misconfigured');
  assert.match(capability.reason, /API_KEY/i);
});

test('explicit transcription disable wins over provider configuration', () => {
  const capability = transcriptionCapabilityStatus({
    env: {
      FORENSISCOPE_TRANSCRIBE_ENABLED: 'false',
      FORENSISCOPE_ASR_PROVIDER: 'openai',
      FORENSISCOPE_ASR_API_KEY: 'test-key'
    }
  });
  assert.equal(capability.ready, false);
  assert.equal(capability.state, 'disabled');
});


test('Gemini app credential auto-enables truthful ForensiScope transcription capacity', () => {
  const env = { GEMINI_API_KEY: 'gemini-test-key' };
  const engine = resolveTranscriptionEngine(env);
  assert.equal(engine.state, 'configured');
  assert.equal(engine.engine_id, 'gemini:gemini-3.5-transcribe');

  const capability = transcriptionCapabilityStatus({ env });
  assert.equal(capability.ready, true);
  assert.equal(capability.engine_id, 'gemini:gemini-3.5-transcribe');
  assert.equal(capability.probe_state, 'ready');
});

test('explicit Gemini provider without a Gemini key fails closed', () => {
  const capability = transcriptionCapabilityStatus({
    env: { FORENSISCOPE_ASR_PROVIDER: 'gemini' }
  });
  assert.equal(capability.ready, false);
  assert.equal(capability.state, 'misconfigured');
  assert.match(capability.reason, /GEMINI_API_KEY/i);
});
