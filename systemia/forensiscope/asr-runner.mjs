import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-transcribe-diarize';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mimeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.m4a':
    case '.mp4': return 'audio/mp4';
    case '.webm': return 'audio/webm';
    case '.ogg': return 'audio/ogg';
    case '.flac': return 'audio/flac';
    default: return 'application/octet-stream';
  }
}

function endpoint(baseUrl) {
  return `${String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/audio/transcriptions`;
}

function normalizeSegments(payload, fallbackDuration = null) {
  const sources = [
    Array.isArray(payload?.segments) ? payload.segments : null,
    Array.isArray(payload?.utterances) ? payload.utterances : null,
    Array.isArray(payload?.results?.segments) ? payload.results.segments : null
  ].filter(Boolean);

  const rawSegments = sources[0] || [];
  const segments = rawSegments
    .map((raw) => {
      const text = String(raw?.text ?? raw?.transcript ?? raw?.words ?? '').replace(/\s+/g, ' ').trim();
      const start = finite(raw?.start ?? raw?.start_seconds ?? raw?.from, null);
      const end = finite(raw?.end ?? raw?.end_seconds ?? raw?.to, null);
      if (!text || start === null || end === null || end < start) return null;
      const confidence = finite(raw?.confidence ?? raw?.avg_confidence, null);
      return {
        start,
        end,
        text,
        ...(raw?.speaker !== undefined && raw?.speaker !== null ? { speaker: String(raw.speaker) } : {}),
        ...(confidence !== null ? { confidence: Math.max(0, Math.min(1, confidence)) } : {})
      };
    })
    .filter(Boolean);

  if (segments.length) return segments;

  const text = String(payload?.text ?? payload?.transcript ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  return [{
    start: 0,
    end: Math.max(0, finite(payload?.duration, fallbackDuration ?? 0) ?? 0),
    text
  }];
}

export function resolveAsrProvider(env = process.env) {
  const provider = String(env.FORENSISCOPE_ASR_PROVIDER || 'openai').trim().toLowerCase();
  if (!['openai', 'openai-compatible'].includes(provider)) {
    throw new Error(`Unsupported FORENSISCOPE_ASR_PROVIDER: ${provider}`);
  }

  const apiKey = required(
    env.FORENSISCOPE_ASR_API_KEY || env.OPENAI_API_KEY,
    'FORENSISCOPE_ASR_API_KEY or OPENAI_API_KEY'
  );
  const baseUrl = String(env.FORENSISCOPE_ASR_BASE_URL || DEFAULT_BASE_URL).trim();
  const model = String(env.FORENSISCOPE_ASR_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Math.max(1000, finite(env.FORENSISCOPE_ASR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    language: String(env.FORENSISCOPE_ASR_LANGUAGE || '').trim() || null,
    prompt: String(env.FORENSISCOPE_ASR_PROMPT || '').trim() || null
  };
}

export async function transcribeWithProvider({
  inputPath,
  durationSeconds = null,
  env = process.env,
  fetchImpl = fetch
}) {
  const config = resolveAsrProvider(env);
  const bytes = fs.readFileSync(inputPath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeFor(inputPath) }), path.basename(inputPath));
  form.append('model', config.model);

  if (config.model === 'gpt-4o-transcribe-diarize') {
    form.append('response_format', 'diarized_json');
    form.append('chunking_strategy', 'auto');
  } else if (config.model === 'whisper-1') {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
  } else {
    form.append('response_format', 'json');
  }

  if (config.language) form.append('language', config.language);
  if (config.prompt && config.model !== 'gpt-4o-transcribe-diarize') {
    form.append('prompt', config.prompt);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetchImpl(endpoint(config.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`ASR provider returned HTTP ${response.status}: ${raw.slice(-1200)}`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('ASR provider returned non-JSON output.');
  }

  return {
    engine_id: `${config.provider}:${config.model}`,
    provider: config.provider,
    model: config.model,
    segments: normalizeSegments(payload, durationSeconds)
  };
}

export async function healthcheckProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const config = resolveAsrProvider(env);
  if (String(env.FORENSISCOPE_ASR_HEALTHCHECK_REMOTE || '').toLowerCase() !== 'true') {
    return {
      ok: true,
      mode: 'configuration',
      engine_id: `${config.provider}:${config.model}`
    };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/models`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });
  if (!response.ok) {
    throw new Error(`ASR remote healthcheck returned HTTP ${response.status}.`);
  }
  return {
    ok: true,
    mode: 'remote',
    engine_id: `${config.provider}:${config.model}`
  };
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--healthcheck')) {
    process.stdout.write(`${JSON.stringify(await healthcheckProvider())}\n`);
    return;
  }

  const inputPath = args.find((arg) => !arg.startsWith('--'));
  if (!inputPath) {
    throw new Error('Usage: node asr-runner.mjs <audio-file> [--duration seconds]');
  }

  const durationSeconds = finite(argValue(args, '--duration'), null);
  const result = await transcribeWithProvider({ inputPath, durationSeconds });
  process.stdout.write(`${JSON.stringify({ segments: result.segments, engine_id: result.engine_id })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
