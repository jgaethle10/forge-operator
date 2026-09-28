import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-transcribe-diarize';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-transcribe';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
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
  return `${String(baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '')}/audio/transcriptions`;
}

function detectProvider(env = process.env) {
  const explicit = String(env.FORENSISCOPE_ASR_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (String(env.GEMINI_API_KEY || '').trim()) return 'gemini';
  if (String(env.FORENSISCOPE_ASR_API_KEY || env.OPENAI_API_KEY || '').trim()) return 'openai';
  return 'openai';
}

function secondsFromOffset(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = raw.endsWith('s') ? raw.slice(0, -1) : raw;
  return finite(numeric, null);
}

function extractGeminiWordAnnotations(interaction) {
  const words = [];
  for (const step of interaction?.steps ?? []) {
    for (const content of step?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type === 'word_info') words.push(annotation);
      }
    }
  }
  return words;
}

export function normalizeGeminiInteraction(interaction, fallbackDuration = null) {
  const words = extractGeminiWordAnnotations(interaction);
  const segments = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    current.text = current.text.replace(/\s+([,.;:!?])/g, '$1').trim();
    if (current.text) segments.push(current);
    current = null;
  };

  for (const word of words) {
    const text = String(word?.text || '').trim();
    const start = secondsFromOffset(word?.start_offset ?? word?.startOffset);
    const end = secondsFromOffset(word?.end_offset ?? word?.endOffset);
    if (!text || start === null || end === null || end < start) continue;

    const speaker = String(word?.speaker || '').trim() || null;
    const gap = current ? start - current.end : null;
    const speakerChanged = current && current.speaker !== speaker;
    const largeGap = current && Number.isFinite(gap) && gap > 1.5;

    if (!current || speakerChanged || largeGap) {
      flush();
      current = { start, end, text, speaker };
    } else {
      current.end = end;
      current.text += ` ${text}`;
    }
  }
  flush();

  if (segments.length) return segments;

  const text = String(
    interaction?.output_text ??
    interaction?.outputText ??
    ''
  ).replace(/\s+/g, ' ').trim();

  if (!text) return [];
  return [{
    start: 0,
    end: Math.max(0, finite(fallbackDuration, 0) ?? 0),
    text,
    speaker: null
  }];
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
  const provider = detectProvider(env);
  if (!['openai', 'openai-compatible', 'gemini'].includes(provider)) {
    throw new Error(`Unsupported FORENSISCOPE_ASR_PROVIDER: ${provider}`);
  }

  const gemini = provider === 'gemini';
  const apiKey = required(
    gemini
      ? (env.FORENSISCOPE_ASR_API_KEY || env.GEMINI_API_KEY)
      : (env.FORENSISCOPE_ASR_API_KEY || env.OPENAI_API_KEY),
    gemini
      ? 'FORENSISCOPE_ASR_API_KEY or GEMINI_API_KEY'
      : 'FORENSISCOPE_ASR_API_KEY or OPENAI_API_KEY'
  );
  const baseUrl = String(
    env.FORENSISCOPE_ASR_BASE_URL ||
    (gemini ? DEFAULT_GEMINI_BASE_URL : DEFAULT_OPENAI_BASE_URL)
  ).trim();
  const model = String(
    env.FORENSISCOPE_ASR_MODEL ||
    (gemini ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL)
  ).trim();
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

async function transcribeWithGemini({
  inputPath,
  durationSeconds,
  config,
  fetchImpl = fetch
}) {
  const bytes = fs.readFileSync(inputPath);
  const mimeType = mimeFor(inputPath);
  const apiRoot = config.baseUrl.replace(/\/+$/, '');

  const startResponse = await fetchImpl(`${apiRoot}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file: { display_name: path.basename(inputPath) }
    })
  });

  if (!startResponse.ok) {
    const body = await startResponse.text();
    throw new Error(`Gemini file upload start returned HTTP ${startResponse.status}: ${body.slice(-1200)}`);
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini resumable upload did not return x-goog-upload-url.');

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType
    },
    body: bytes
  });

  const uploadRaw = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new Error(`Gemini file upload returned HTTP ${uploadResponse.status}: ${uploadRaw.slice(-1200)}`);
  }

  let uploaded;
  try {
    uploaded = JSON.parse(uploadRaw)?.file || null;
  } catch {
    throw new Error('Gemini file upload returned non-JSON metadata.');
  }
  if (!uploaded?.uri) throw new Error('Gemini file upload did not return a file URI.');

  try {
    const transcriptionConfig = {
      mode: {
        type: 'verbatim',
        diarization_mode: 'speaker',
        timestamp_granularities: ['word']
      }
    };
    if (config.language) transcriptionConfig.language_codes = [config.language];

    const interactionResponse = await fetchImpl(`${apiRoot}/v1beta/interactions`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        input: [{
          type: 'audio',
          uri: uploaded.uri,
          mime_type: mimeType
        }],
        generation_config: {
          transcription_config: transcriptionConfig
        }
      })
    });

    const interactionRaw = await interactionResponse.text();
    if (!interactionResponse.ok) {
      throw new Error(`Gemini transcription returned HTTP ${interactionResponse.status}: ${interactionRaw.slice(-1200)}`);
    }

    let interaction;
    try {
      interaction = JSON.parse(interactionRaw);
    } catch {
      throw new Error('Gemini transcription returned non-JSON output.');
    }

    return {
      engine_id: `gemini:${config.model}`,
      provider: 'gemini',
      model: config.model,
      segments: normalizeGeminiInteraction(interaction, durationSeconds)
    };
  } finally {
    if (uploaded?.name) {
      try {
        await fetchImpl(`${apiRoot}/v1beta/${uploaded.name}`, {
          method: 'DELETE',
          headers: { 'x-goog-api-key': config.apiKey }
        });
      } catch {
        // Gemini files expire automatically; cleanup is best-effort.
      }
    }
  }
}

export async function transcribeWithProvider({
  inputPath,
  durationSeconds = null,
  env = process.env,
  fetchImpl = fetch
}) {
  const config = resolveAsrProvider(env);
  if (config.provider === 'gemini') {
    return transcribeWithGemini({
      inputPath,
      durationSeconds,
      config,
      fetchImpl
    });
  }

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

  const gemini = config.provider === 'gemini';
  const url = gemini
    ? `${config.baseUrl.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(config.model)}`
    : `${config.baseUrl.replace(/\/+$/, '')}/models`;
  const response = await fetchImpl(url, {
    headers: gemini
      ? { 'x-goog-api-key': config.apiKey }
      : { Authorization: `Bearer ${config.apiKey}` }
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
