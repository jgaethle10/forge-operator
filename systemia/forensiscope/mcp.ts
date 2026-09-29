import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { processMeetingBatch } from './batch-transcribe.mjs';
import { transcriptionCapabilityStatus } from './transcription-engine.mjs';

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'
]);

function maxDirectBytes() {
  const parsed = Number(process.env.FORENSISCOPE_DIRECT_FILE_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_BYTES;
}

function bearerToken(req: Request) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function authorized(req: Request) {
  const expected = String(process.env.FORENSISCOPE_MCP_BEARER_TOKEN || '').trim();
  if (!expected) return false;
  const actual = bearerToken(req);
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a,b] = address.split('.').map(Number);
    return a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb');
  }
  return true;
}

async function publicLookup(hostname: string) {
  const rows = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  const usable = rows.filter((row) => !isPrivateAddress(row.address));
  if (!usable.length) throw new Error('Attachment host did not resolve to a public address.');
  return usable[0];
}

function safeFilename(value: unknown) {
  const base = path.basename(String(value || 'attached-media'))
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 180);
  return base || 'attached-media';
}

async function downloadAttachment(downloadUrl: string, fileName: string, destination: string, byteLimit: number) {
  const target = new URL(downloadUrl);
  if (target.protocol !== 'https:') throw new Error('Attachment download URL must use HTTPS.');
  if (target.port && target.port !== '443') throw new Error('Attachment download URL must use HTTPS port 443.');
  if (net.isIP(target.hostname)) throw new Error('Attachment download URL must not use an IP literal.');

  const pinned = await publicLookup(target.hostname);
  const expectedHost = target.hostname;

  return await new Promise<{ sha256: string; size_bytes: number; content_type: string | null }>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const out = fs.createWriteStream(destination, { flags: 'wx' });

    const request = https.request({
      protocol: 'https:',
      hostname: target.hostname,
      port: 443,
      method: 'GET',
      path: target.pathname + target.search,
      headers: {
        host: expectedHost,
        accept: 'application/octet-stream, audio/*, video/*;q=0.9',
        'user-agent': 'Evercraft-ForensiScope/1.0'
      },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family)
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400) {
        response.resume();
        reject(new Error('Attachment redirects are not accepted.'));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Attachment download returned HTTP ${status}.`));
        return;
      }
      if (response.headers['content-encoding']) {
        response.resume();
        reject(new Error('Compressed HTTP attachment responses are not accepted.'));
        return;
      }

      const declared = Number(response.headers['content-length'] || 0);
      if (Number.isFinite(declared) && declared > byteLimit) {
        response.resume();
        reject(new Error(`Attachment exceeds direct-ingest byte limit (${declared} > ${byteLimit}).`));
        return;
      }

      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > byteLimit) {
          request.destroy(new Error(`Attachment exceeds direct-ingest byte limit (${bytes} > ${byteLimit}).`));
          return;
        }
        hash.update(chunk);
      });
      response.pipe(out);
      out.on('finish', () => {
        out.close();
        resolve({
          sha256: `sha256:${hash.digest('hex')}`,
          size_bytes: bytes,
          content_type: response.headers['content-type'] ? String(response.headers['content-type']) : null
        });
      });
    });

    request.setTimeout(60_000, () => request.destroy(new Error('Attachment download timed out.')));
    request.on('error', (error) => {
      out.destroy();
      try { fs.rmSync(destination, { force: true }); } catch {}
      reject(error);
    });
    out.on('error', (error) => {
      request.destroy(error);
    });
    request.end();
  });
}

function jsonRpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

export function forensiScopeToolList() {
  return [
    {
      name: 'get_forensiscope_capabilities',
      title: 'Get ForensiScope capabilities',
      description: 'Return current sovereign ForensiScope runtime readiness and direct-ingest boundaries. Read-only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: 'analyze_attached_media',
      title: 'Analyze attached media with ForensiScope',
      description: 'Analyze one audio/video file the user explicitly attached or selected in the AI client. Requires rights_attested=true. The file is fetched once from the client-supplied temporary URL, hashed, processed through the sovereign ForensiScope ASR runtime, and removed from temporary ingress storage after processing.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'object',
            properties: {
              download_url: { type: 'string', format: 'uri' },
              file_id: { type: 'string', minLength: 1 },
              mime_type: { type: 'string' },
              file_name: { type: 'string' }
            },
            required: ['download_url', 'file_id'],
            additionalProperties: false
          },
          rights_attested: {
            type: 'boolean',
            description: 'Must be true only after the user affirms lawful authority to submit the media.'
          },
          request: { type: 'string', maxLength: 7000 }
        },
        required: ['file', 'rights_attested'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: {
        'openai/fileParams': ['file'],
        'openai/toolInvocation/invoking': 'ForensiScope is analyzing the attached media…',
        'openai/toolInvocation/invoked': 'ForensiScope analysis is ready'
      }
    }
  ];
}

async function callAnalyze(argumentsInput: any) {
  if (argumentsInput?.rights_attested !== true) {
    throw new Error('rights_attestation_required');
  }

  const file = argumentsInput?.file || {};
  const downloadUrl = String(file.download_url || '').trim();
  const sourceFileId = String(file.file_id || '').trim();
  const fileName = safeFilename(file.file_name || sourceFileId || 'attached-media');
  const ext = path.extname(fileName).toLowerCase();

  if (!downloadUrl || !sourceFileId) throw new Error('file_download_url_and_file_id_required');
  if (!MEDIA_EXTENSIONS.has(ext)) throw new Error(`unsupported_media_extension:${ext || 'none'}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-mcp-'));
  const inputPath = path.join(tempRoot, fileName);

  try {
    const ingress = await downloadAttachment(downloadUrl, fileName, inputPath, maxDirectBytes());
    const transcript = processMeetingBatch({
      files: [inputPath],
      chunkSeconds: 300,
      overlapSeconds: 2,
      keepAudio: false
    });

    const observedSource = transcript.sources?.[0] || {};
    const transcriptHash = observedSource.source_sha256
      ? `sha256:${String(observedSource.source_sha256).replace(/^sha256:/, '')}`
      : null;
    if (transcriptHash && transcriptHash !== ingress.sha256) {
      throw new Error('source_hash_mismatch_after_ingest');
    }

    return {
      ok: true,
      schema: 'evercraft.forensiscope.chat-attachment.v1',
      runtime: 'yard_evercraft_compute',
      base44_dependency: false,
      source: {
        provider: 'ai_client_file_param',
        file_id: sourceFileId,
        file_name: fileName,
        mime_type: file.mime_type || ingress.content_type || null,
        size_bytes: ingress.size_bytes,
        sha256: ingress.sha256
      },
      request: String(argumentsInput?.request || '').trim() || null,
      transcript,
      truth_boundary: {
        rights_attested: true,
        source_identity_hash_verified: true,
        temporary_client_download_url_persisted: false,
        temporary_ingress_file_retained: false,
        unknown_people_identified_automatically: false,
        intent_or_guilt_determined: false
      }
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export async function executeForensiScopeMcpRpc(rpc: any) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return jsonRpc(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'evercraft-forensiscope', version: '0.2.0' },
      instructions: 'Sovereign Evercraft ForensiScope media analysis runtime. Preserve rights, provenance, source hashes, timestamps, uncertainty, and user control.'
    });
  }

  if (method === 'tools/list') return jsonRpc(id, { tools: forensiScopeToolList() });
  if (method === 'notifications/initialized') return null;

  if (method === 'tools/call') {
    const name = String(rpc?.params?.name || '');
    if (name === 'get_forensiscope_capabilities') {
      const speech = transcriptionCapabilityStatus();
      const payload = {
        ok: true,
        runtime: 'yard_evercraft_compute',
        base44_dependency: false,
        transcription: speech,
        direct_file_max_bytes: maxDirectBytes(),
        tools: forensiScopeToolList().map((tool) => tool.name)
      };
      return jsonRpc(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false
      });
    }

    if (name === 'analyze_attached_media') {
      try {
        const payload = await callAnalyze(rpc?.params?.arguments || {});
        return jsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }) }],
          structuredContent: { ok: false, error: message },
          isError: true
        });
      }
    }

    return jsonRpcError(id, -32602, 'Unknown or unsupported ForensiScope tool.');
  }

  return jsonRpcError(id, -32601, 'Method not found.');
}

export function registerForensiScopeMcp(app: Express) {
  const mcpPath = '/mcp/forensiscope';

  app.get(mcpPath, (req: Request, res: Response) => {
    if (String(req.query.action || '') !== 'health') {
      res.status(405).json({ ok: false, error: 'Use MCP Streamable HTTP POST or ?action=health.' });
      return;
    }
    const speech = transcriptionCapabilityStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: speech.ready,
      service: 'ForensiScope',
      server: 'evercraft-forensiscope',
      version: '0.2.0',
      runtime: 'yard_evercraft_compute',
      base44_dependency: false,
      auth_configured: Boolean(String(process.env.FORENSISCOPE_MCP_BEARER_TOKEN || '').trim()),
      transcription: speech,
      direct_file_max_bytes: maxDirectBytes(),
      tools: forensiScopeToolList().map((tool) => tool.name)
    });
  });

  app.post(mcpPath, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="evercraft-forensiscope"');
      res.status(401).json(jsonRpcError(req.body?.id ?? null, -32001, 'ForensiScope MCP authentication required.'));
      return;
    }

    try {
      const response = await executeForensiScopeMcpRpc(req.body);
      if (response === null) {
        res.status(202).end();
        return;
      }
      res.type('application/json').json(response);
    } catch (error) {
      res.status(500).json(jsonRpcError(
        req.body?.id ?? null,
        -32000,
        error instanceof Error ? error.message : 'ForensiScope MCP failed.'
      ));
    }
  });
}
