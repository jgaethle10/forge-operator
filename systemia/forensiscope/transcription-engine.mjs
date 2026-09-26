import { spawnSync } from 'node:child_process';

const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const MAX_SEGMENTS_PER_SHARD = 10000;

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

function parseHealthcheckArgs(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON must be valid JSON.');
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    throw new Error('FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON must be a JSON array of strings.');
  }
  return parsed;
}

export function resolveTranscriptionEngine(env = process.env) {
  const enabled = String(env.FORENSISCOPE_TRANSCRIBE_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    return {
      state: 'disabled',
      engine_id: null,
      reason: 'FORENSISCOPE_TRANSCRIBE_ENABLED is not true.'
    };
  }

  const engineId = String(env.FORENSISCOPE_TRANSCRIBE_ENGINE_ID || '').trim();
  const executable = String(env.FORENSISCOPE_TRANSCRIBE_EXECUTABLE || '').trim();
  if (!engineId || !executable) {
    return {
      state: 'misconfigured',
      engine_id: engineId || null,
      reason: 'Enabled transcription requires FORENSISCOPE_TRANSCRIBE_ENGINE_ID and FORENSISCOPE_TRANSCRIBE_EXECUTABLE.'
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

export function probeTranscriptionEngineCapability(env = process.env) {
  const engine = resolveTranscriptionEngine(env);
  if (engine.state !== 'configured') {
    return {
      ready: false,
      state: engine.state,
      engine_id: engine.engine_id || null,
      reason: engine.reason || null
    };
  }

  let args;
  try {
    args = parseHealthcheckArgs(
      env.FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON
    );
  } catch (error) {
    return {
      ready: false,
      state: 'healthcheck_configuration_error',
      engine_id: engine.engine_id,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  if (!args) {
    return {
      ready: false,
      state: 'healthcheck_not_configured',
      engine_id: engine.engine_id,
      reason:
        'FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_ARGS_JSON is required before a NodeSeed may advertise transcription capability.'
    };
  }

  const started = Date.now();
  const result = spawnSync(engine.executable, args, {
    encoding: 'utf8',
    env,
    timeout: Math.max(
      250,
      Math.min(
        30000,
        Number(env.FORENSISCOPE_TRANSCRIBE_HEALTHCHECK_TIMEOUT_MS || 5000)
      )
    ),
    maxBuffer: Math.min(engine.max_buffer_bytes, 4 * 1024 * 1024)
  });

  const durationMs = Date.now() - started;
  if (result.status !== 0) {
    return {
      ready: false,
      state: result.error?.code === 'ETIMEDOUT'
        ? 'healthcheck_timeout'
        : 'healthcheck_failed',
      engine_id: engine.engine_id,
      duration_ms: durationMs,
      reason:
        result.error?.message ||
        String(result.stderr || result.stdout || '').trim().slice(-1000) ||
        'Transcription engine healthcheck failed.'
    };
  }

  return {
    ready: true,
    state: 'ready',
    engine_id: engine.engine_id,
    duration_ms: durationMs
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
