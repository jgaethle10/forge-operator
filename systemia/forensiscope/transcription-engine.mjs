import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const MAX_SEGMENTS_PER_SHARD = 10000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANAGED_RUNNER = path.join(HERE, 'asr-runner.mjs');

function asFinite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgsTemplate(raw) {
  if (!raw) return ['{input}'];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FORENSISCOPE_TRANSCRIBE_ARGS_JSON must be valid JSON.');
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    throw new Error('FORENSISCOPE_TRANSCRIBE_ARGS_JSON must be a JSON array of strings.');
  }
  return parsed;
}

function substitute(value, context) {
  return String(value)
    .replaceAll('{input}', context.input)
    .replaceAll('{duration}', String(context.duration_seconds))
    .replaceAll('{timeline_offset}', String(context.timeline_offset_seconds))
    .replaceAll('{shard_start}', String(context.shard_start_seconds))
    .replaceAll('{shard_end}', String(context.shard_end_seconds));
}


function managedProviderEngine(env) {
  const explicitProvider = String(env.FORENSISCOPE_ASR_PROVIDER || '').trim().toLowerCase();
  const provider = explicitProvider || (
    String(env.GEMINI_API_KEY || '').trim()
      ? 'gemini'
      : String(env.FORENSISCOPE_ASR_API_KEY || env.OPENAI_API_KEY || '').trim()
        ? 'openai'
        : ''
  );
  if (!provider) return null;

  if (!['openai', 'openai-compatible', 'gemini'].includes(provider)) {
    return {
      state: 'misconfigured',
      engine_id: null,
      reason: `Unsupported FORENSISCOPE_ASR_PROVIDER: ${provider}`
    };
  }

  const gemini = provider === 'gemini';
  const apiKeyPresent = Boolean(String(
    gemini
      ? (env.FORENSISCOPE_ASR_API_KEY || env.GEMINI_API_KEY || '')
      : (env.FORENSISCOPE_ASR_API_KEY || env.OPENAI_API_KEY || '')
  ).trim());
  if (!apiKeyPresent) {
    return {
      state: 'misconfigured',
      engine_id: null,
      reason: gemini
        ? 'Gemini ASR requires FORENSISCOPE_ASR_API_KEY or GEMINI_API_KEY.'
        : 'Managed ASR requires FORENSISCOPE_ASR_API_KEY or OPENAI_API_KEY.'
    };
  }

  const model = String(
    env.FORENSISCOPE_ASR_MODEL ||
    (gemini ? 'gemini-3.5-transcribe' : 'gpt-4o-transcribe-diarize')
  ).trim();
  return {
    state: 'configured',
    engine_id: `${provider}:${model}`,
    executable: process.execPath,
    args_template: [MANAGED_RUNNER, '{input}', '--duration', '{duration}'],
    max_buffer_bytes: Math.max(
      1024 * 1024,
      asFinite(env.FORENSISCOPE_TRANSCRIBE_MAX_BUFFER_BYTES, DEFAULT_MAX_BUFFER)
    )
  };
}

export function resolveTranscriptionEngine(env = process.env) {
  const enabledSetting = String(env.FORENSISCOPE_TRANSCRIBE_ENABLED || '').trim().toLowerCase();
  const managed = managedProviderEngine(env);
  const enabled = enabledSetting === 'true' || (!enabledSetting && managed !== null);

  if (!enabled || enabledSetting === 'false') {
    return {
      state: 'disabled',
      engine_id: null,
      reason: 'Transcription is disabled. Set FORENSISCOPE_TRANSCRIBE_ENABLED=true, configure FORENSISCOPE_ASR_PROVIDER, or provide a supported provider key such as GEMINI_API_KEY.'
    };
  }

  if (managed) return managed;

  const engineId = String(env.FORENSISCOPE_TRANSCRIBE_ENGINE_ID || '').trim();
  const executable = String(env.FORENSISCOPE_TRANSCRIBE_EXECUTABLE || '').trim();
  if (!engineId || !executable) {
    return {
      state: 'misconfigured',
      engine_id: engineId || null,
      reason: 'Enabled transcription requires either a managed FORENSISCOPE_ASR_PROVIDER or FORENSISCOPE_TRANSCRIBE_ENGINE_ID plus FORENSISCOPE_TRANSCRIBE_EXECUTABLE.'
    };
  }

  return {
    state: 'configured',
    engine_id: engineId,
    executable,
    args_template: parseArgsTemplate(env.FORENSISCOPE_TRANSCRIBE_ARGS_JSON),
    max_buffer_bytes: Math.max(
      1024 * 1024,
      asFinite(env.FORENSISCOPE_TRANSCRIBE_MAX_BUFFER_BYTES, DEFAULT_MAX_BUFFER)
    )
  };
}

function normalizeSegments(payload, bounds) {
  const rawSegments = Array.isArray(payload) ? payload : payload?.segments;
  if (!Array.isArray(rawSegments)) {
    throw new Error('Transcription engine output must be a JSON array or an object with a segments array.');
  }

  const segments = [];
  for (const raw of rawSegments.slice(0, MAX_SEGMENTS_PER_SHARD)) {
    const text = String(raw?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const localStart = asFinite(raw?.start_seconds ?? raw?.start ?? raw?.from, null);
    const localEnd = asFinite(raw?.end_seconds ?? raw?.end ?? raw?.to, null);
    if (localStart === null || localEnd === null || localEnd < localStart) continue;

    const clampedStart = Math.max(0, Math.min(bounds.duration_seconds, localStart));
    const clampedEnd = Math.max(clampedStart, Math.min(bounds.duration_seconds, localEnd));
    const confidence = asFinite(raw?.confidence, null);

    segments.push({
      start_seconds: bounds.timeline_offset_seconds + clampedStart,
      end_seconds: bounds.timeline_offset_seconds + clampedEnd,
      text,
      confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
      speaker: raw?.speaker ? String(raw.speaker) : null
    });
  }

  return segments;
}

export function probeTranscriptionEngine({ env = process.env } = {}) {
  const engine = resolveTranscriptionEngine(env);
  if (engine.state !== 'configured') return engine;

  const managed = engine.executable === process.execPath && engine.args_template?.[0] === MANAGED_RUNNER;
  if (!managed) return { ...engine, probe_state: 'configuration_only' };

  const result = spawnSync(engine.executable, [MANAGED_RUNNER, '--healthcheck'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env
  });

  return {
    ...engine,
    probe_state: result.status === 0 ? 'ready' : 'unavailable',
    probe_reason: result.status === 0
      ? null
      : (result.error?.message || String(result.stderr || '').trim().slice(-1200) || 'ASR healthcheck failed.')
  };
}

export function transcriptionCapabilityStatus({ env = process.env } = {}) {
  const probe = probeTranscriptionEngine({ env });
  const ready =
    probe.state === 'configured' &&
    probe.probe_state !== 'unavailable';

  return {
    ready,
    state: probe.state,
    engine_id: probe.engine_id || null,
    probe_state: probe.probe_state || null,
    reason: probe.probe_reason || probe.reason || null
  };
}

export function transcribePreparedAudio({
  audioPath,
  bounds,
  env = process.env
}) {
  const engine = resolveTranscriptionEngine(env);
  if (engine.state !== 'configured') {
    return {
      state: engine.state === 'disabled' ? 'engine_not_configured' : 'engine_configuration_error',
      engine_id: engine.engine_id,
      reason: engine.reason,
      segments: []
    };
  }

  const context = {
    input: audioPath,
    duration_seconds: bounds.duration,
    timeline_offset_seconds: bounds.offset + bounds.start,
    shard_start_seconds: bounds.start,
    shard_end_seconds: bounds.end
  };
  const args = engine.args_template.map((value) => substitute(value, context));

  const result = spawnSync(engine.executable, args, {
    encoding: 'utf8',
    maxBuffer: engine.max_buffer_bytes,
    env
  });

  if (result.status !== 0) {
    return {
      state: 'engine_error',
      engine_id: engine.engine_id,
      reason: result.error?.message || String(result.stderr || result.stdout || '').trim().slice(-1200) || 'Transcription engine failed.',
      segments: []
    };
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch {
    return {
      state: 'invalid_engine_output',
      engine_id: engine.engine_id,
      reason: 'Transcription engine stdout was not valid JSON.',
      segments: []
    };
  }

  let segments;
  try {
    segments = normalizeSegments(payload, {
      duration_seconds: bounds.duration,
      timeline_offset_seconds: bounds.offset + bounds.start
    });
  } catch (error) {
    return {
      state: 'invalid_engine_output',
      engine_id: engine.engine_id,
      reason: error instanceof Error ? error.message : String(error),
      segments: []
    };
  }

  return {
    state: 'transcribed',
    engine_id: engine.engine_id,
    segment_count: segments.length,
    segments
  };
}
