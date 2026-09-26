import { spawnSync } from 'node:child_process';

const MAX_DIMENSIONS = 4096;
const DEFAULT_BATCH_SIZE = 128;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

function parseArgsTemplate(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FORENSISCOPE_SEMANTIC_ARGS_JSON must be valid JSON.');
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    throw new Error('FORENSISCOPE_SEMANTIC_ARGS_JSON must be a JSON array of strings.');
  }
  return parsed;
}

export function resolveSemanticEngine(env = process.env) {
  const enabled = String(env.FORENSISCOPE_SEMANTIC_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    return {
      state: 'disabled',
      engine_id: null,
      reason: 'FORENSISCOPE_SEMANTIC_ENABLED is not true.'
    };
  }

  const engineId = String(env.FORENSISCOPE_SEMANTIC_ENGINE_ID || '').trim();
  const executable = String(env.FORENSISCOPE_SEMANTIC_EXECUTABLE || '').trim();
  if (!engineId || !executable) {
    return {
      state: 'misconfigured',
      engine_id: engineId || null,
      reason:
        'Enabled semantic search requires FORENSISCOPE_SEMANTIC_ENGINE_ID and FORENSISCOPE_SEMANTIC_EXECUTABLE.'
    };
  }

  return {
    state: 'configured',
    engine_id: engineId,
    executable,
    args: parseArgsTemplate(env.FORENSISCOPE_SEMANTIC_ARGS_JSON),
    batch_size: Math.max(
      1,
      Math.min(1024, Number(env.FORENSISCOPE_SEMANTIC_BATCH_SIZE || DEFAULT_BATCH_SIZE))
    ),
    max_buffer_bytes: Math.max(
      1024 * 1024,
      Number(env.FORENSISCOPE_SEMANTIC_MAX_BUFFER_BYTES || DEFAULT_MAX_BUFFER)
    )
  };
}

function normalizeVector(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_DIMENSIONS) {
    throw new Error('Semantic engine returned an invalid vector dimension.');
  }
  const vector = raw.map((value) => Number(value));
  if (!vector.every(Number.isFinite)) {
    throw new Error('Semantic engine returned a non-finite vector value.');
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error('Semantic engine returned a zero-magnitude vector.');
  }
  return vector.map((value) => value / magnitude);
}

function runBatch(engine, texts, env) {
  const result = spawnSync(engine.executable, engine.args, {
    encoding: 'utf8',
    input: JSON.stringify({ texts }),
    maxBuffer: engine.max_buffer_bytes,
    env
  });

  if (result.status !== 0) {
    throw new Error(
      'ForensiScope semantic engine failed: ' +
      (result.error?.message ||
        String(result.stderr || result.stdout || '').trim().slice(-1500) ||
        'unknown semantic engine error')
    );
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new Error('ForensiScope semantic engine stdout was not valid JSON.');
  }

  const vectors = Array.isArray(payload) ? payload : payload?.vectors;
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error('ForensiScope semantic engine returned the wrong vector count.');
  }
  return vectors.map(normalizeVector);
}

export function embedSemanticTexts(texts, {
  env = process.env
} = {}) {
  const cleanTexts = (texts || []).map((value) => String(value || ''));
  const engine = resolveSemanticEngine(env);
  if (engine.state !== 'configured') {
    return {
      state:
        engine.state === 'disabled'
          ? 'engine_not_configured'
          : 'engine_configuration_error',
      engine_id: engine.engine_id,
      reason: engine.reason,
      vectors: []
    };
  }

  try {
    const vectors = [];
    for (let start = 0; start < cleanTexts.length; start += engine.batch_size) {
      const batch = cleanTexts.slice(start, start + engine.batch_size);
      vectors.push(...runBatch(engine, batch, env));
    }

    const dimensions = vectors.length ? vectors[0].length : 0;
    if (vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error('ForensiScope semantic engine returned inconsistent vector dimensions.');
    }

    return {
      state: 'ready',
      engine_id: engine.engine_id,
      dimensions,
      vector_count: vectors.length,
      vectors
    };
  } catch (error) {
    return {
      state: 'engine_error',
      engine_id: engine.engine_id,
      reason: error instanceof Error ? error.message : String(error),
      vectors: []
    };
  }
}
