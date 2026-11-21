import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";

const PROVIDERS = Object.freeze(["ollama", "gemini", "openai"]);

function clean(value, max = 50000) {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
}

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 262144) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("request_body_required");
  try { return JSON.parse(text); }
  catch { throw new Error("request_body_invalid_json"); }
}

function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function latestVaultSecret(stateDir, provider) {
  if (!stateDir) return null;
  const vault = new ProviderCredentialVault({ stateDir });
  const meta = vault.list({ provider })[0] || null;
  if (!meta) return null;
  const raw = vault.readSecret(meta.credential_ref);
  return {
    credential_ref: meta.credential_ref,
    api_key_id: clean(raw?.api_key_id, 1000),
    api_secret: clean(raw?.api_secret, 16000),
  };
}

function openAIText(body) {
  if (clean(body?.output_text)) return clean(body.output_text);
  const chunks = [];
  for (const item of Array.isArray(body?.output) ? body.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      const text = clean(part?.text || part?.value || part?.content);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function geminiText(body) {
  const chunks = [];
  for (const candidate of Array.isArray(body?.candidates) ? body.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      const text = clean(part?.text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

async function fetchJson(url, init, { fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

export function supportedInferenceProviders() {
  return [...PROVIDERS];
}

export function createInferenceEngine({
  provider = "",
  model = "",
  credentialStateDir = "",
  ollamaOrigin = "http://127.0.0.1:11434",
  openaiOrigin = "https://api.openai.com",
  geminiOrigin = "https://generativelanguage.googleapis.com",
  fetchImpl = globalThis.fetch,
  timeoutMs = 120000,
  now = () => new Date(),
} = {}) {
  const providerKey = clean(provider, 80).toLowerCase();
  const modelKey = clean(model, 300);
  if (!PROVIDERS.includes(providerKey)) throw new Error("raven_inference_provider_invalid");
  if (!modelKey) throw new Error("raven_inference_model_required");

  async function inferOllama(input, maxOutputTokens = null) {
    const base = clean(ollamaOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.protocol !== "http:") {
      throw new Error("ollama_origin_must_be_loopback_http");
    }
    const { response, body } = await fetchJson(base + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelKey,
        prompt: input,
        stream: false,
        ...(maxOutputTokens !== null ? {options:{num_predict:maxOutputTokens}} : {}),
      }),
    }, { fetchImpl, timeoutMs });
    const text = clean(body?.response);
    if (!response.ok || !text) {
      throw new Error(clean(body?.error || ("ollama_http_" + response.status), 2000));
    }
    // Capped Mossmere requests require real Ollama usage counts; never
    // fabricate zeros or infer them from string lengths.
    const measured = maxOutputTokens === null ? null : {
      input_tokens:body?.prompt_eval_count,
      output_tokens:body?.eval_count,
      cost_micro_usd:0,
      evidence:'local_ollama_measured_zero_external_provider_fee'
    };
    if(measured&&(!Number.isInteger(measured.input_tokens)||measured.input_tokens<0||
      !Number.isInteger(measured.output_tokens)||measured.output_tokens<0||
      measured.output_tokens>maxOutputTokens))throw Error('ollama_capped_usage_unverified');
    return {
      text,
      provider: "ollama",
      model: clean(body?.model || modelKey, 300),
      provider_request_id: null,
      credential_ref: null,
      usage:measured,
    };
  }

  async function inferGemini(input) {
    const secret = latestVaultSecret(credentialStateDir, "gemini");
    if (!secret?.api_secret) throw new Error("gemini_credential_missing");
    const base = clean(geminiOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
      throw new Error("gemini_origin_invalid");
    }
    const endpoint = base + "/v1beta/models/" + encodeURIComponent(modelKey) + ":generateContent";
    const { response, body } = await fetchJson(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": secret.api_secret,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input }] }],
      }),
    }, { fetchImpl, timeoutMs });
    const text = geminiText(body);
    if (!response.ok || !text) {
      throw new Error(clean(body?.error?.message || ("gemini_http_" + response.status), 2000));
    }
    return {
      text,
      provider: "gemini",
      model: modelKey,
      provider_request_id: clean(response.headers?.get?.("x-request-id"), 300) || null,
      credential_ref: secret.credential_ref,
    };
  }

  async function inferOpenAI(input) {
    const secret = latestVaultSecret(credentialStateDir, "openai");
    if (!secret?.api_secret) throw new Error("openai_credential_missing");
    const base = clean(openaiOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "api.openai.com") {
      throw new Error("openai_origin_invalid");
    }
    const { response, body } = await fetchJson(base + "/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + secret.api_secret,
      },
      body: JSON.stringify({
        model: modelKey,
        input: [{ role: "user", content: input }],
      }),
    }, { fetchImpl, timeoutMs });
    const text = openAIText(body);
    if (!response.ok || !text) {
      throw new Error(clean(body?.error?.message || ("openai_http_" + response.status), 2000));
    }
    return {
      text,
      provider: "openai",
      model: clean(body?.model || modelKey, 300),
      provider_request_id: clean(body?.id || response.headers?.get?.("x-request-id"), 300) || null,
      credential_ref: secret.credential_ref,
    };
  }

  async function validateOllama() {
    const base = clean(ollamaOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.protocol !== "http:") {
      throw new Error("ollama_origin_must_be_loopback_http");
    }
    const { response, body } = await fetchJson(base + "/api/tags", {
      method: "GET",
      headers: { "accept": "application/json" },
    }, { fetchImpl, timeoutMs });
    if (!response.ok) throw new Error("ollama_model_list_http_" + response.status);
    const rows = Array.isArray(body?.models) ? body.models : [];
    const wanted = modelKey.toLowerCase();
    const available = rows.some((row) => {
      const names = [clean(row?.name, 300), clean(row?.model, 300)]
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      return names.some((value) =>
        value === wanted ||
        value === wanted + ":latest" ||
        (wanted.endsWith(":latest") && value === wanted.slice(0, -7))
      );
    });
    if (!available) throw new Error("ollama_model_not_installed");
    return {
      provider: "ollama",
      model: modelKey,
      provider_request_id: null,
      credential_ref: null,
      metadata_endpoint: "/api/tags",
    };
  }

  async function validateGemini() {
    const secret = latestVaultSecret(credentialStateDir, "gemini");
    if (!secret?.api_secret) throw new Error("gemini_credential_missing");
    const base = clean(geminiOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
      throw new Error("gemini_origin_invalid");
    }
    const endpoint = base + "/v1beta/models/" + encodeURIComponent(modelKey);
    const { response, body } = await fetchJson(endpoint, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "x-goog-api-key": secret.api_secret,
      },
    }, { fetchImpl, timeoutMs });
    if (!response.ok) {
      throw new Error(clean(body?.error?.message || ("gemini_model_http_" + response.status), 2000));
    }
    const returnedName = clean(body?.name, 500);
    if (returnedName && returnedName !== "models/" + modelKey) {
      throw new Error("gemini_model_identity_mismatch");
    }
    return {
      provider: "gemini",
      model: modelKey,
      provider_request_id: clean(response.headers?.get?.("x-request-id"), 300) || null,
      credential_ref: secret.credential_ref,
      metadata_endpoint: "/v1beta/models/" + modelKey,
    };
  }

  async function validateOpenAI() {
    const secret = latestVaultSecret(credentialStateDir, "openai");
    if (!secret?.api_secret) throw new Error("openai_credential_missing");
    const base = clean(openaiOrigin, 2000).replace(/\/$/, "");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "api.openai.com") {
      throw new Error("openai_origin_invalid");
    }
    const endpoint = base + "/v1/models/" + encodeURIComponent(modelKey);
    const { response, body } = await fetchJson(endpoint, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "authorization": "Bearer " + secret.api_secret,
      },
    }, { fetchImpl, timeoutMs });
    if (!response.ok) {
      throw new Error(clean(body?.error?.message || ("openai_model_http_" + response.status), 2000));
    }
    if (clean(body?.id, 300) !== modelKey) throw new Error("openai_model_identity_mismatch");
    return {
      provider: "openai",
      model: modelKey,
      provider_request_id: clean(response.headers?.get?.("x-request-id"), 300) || null,
      credential_ref: secret.credential_ref,
      metadata_endpoint: "/v1/models/" + modelKey,
    };
  }

  return {
    provider: providerKey,
    model: modelKey,
    async validate() {
      const startedAt = now().toISOString();
      const result = providerKey === "ollama"
        ? await validateOllama()
        : providerKey === "gemini"
          ? await validateGemini()
          : await validateOpenAI();
      const completedAt = now().toISOString();
      const receiptCore = {
        schema: "evercraft.raven.provider-validation-receipt.v1",
        provider: result.provider,
        model: result.model,
        provider_request_id: result.provider_request_id,
        credential_ref: result.credential_ref,
        metadata_endpoint: result.metadata_endpoint,
        inference_performed: false,
        prompt_sent: false,
        started_at: startedAt,
        completed_at: completedAt,
        base44_used: false,
        raw_credential_returned: false,
      };
      return {
        status: "available",
        provider: result.provider,
        model: result.model,
        validation_receipt: sha256(JSON.stringify(receiptCore)),
        inference_performed: false,
        prompt_sent: false,
        base44_used: false,
        raw_credential_returned: false,
      };
    },
    async infer({ request_id, role, input, max_output_tokens = null }) {
      const requestId = clean(request_id, 260);
      const roleKey = clean(role, 120);
      const prompt = clean(input, 50000);
      if (!requestId) throw new Error("inference_request_id_required");
      if (!roleKey) throw new Error("inference_role_required");
      if (!prompt) throw new Error("inference_input_required");
      if(max_output_tokens!==null&&(!Number.isInteger(max_output_tokens)||
        max_output_tokens<1||max_output_tokens>900))throw Error('inference_output_budget_invalid');
      if(max_output_tokens!==null&&providerKey!=='ollama')
        throw Error('inference_hosted_output_budget_not_supported');

      const startedAt = now().toISOString();
      const result = providerKey === "ollama"
        ? await inferOllama(prompt,max_output_tokens)
        : providerKey === "gemini"
          ? await inferGemini(prompt)
          : await inferOpenAI(prompt);
      const completedAt = now().toISOString();
      const receiptCore = {
        schema: "evercraft.raven.provider-inference-receipt.v1",
        request_id: requestId,
        role: roleKey,
        provider: result.provider,
        model: result.model,
        provider_request_id: result.provider_request_id,
        credential_ref: result.credential_ref,
        prompt_sha256: sha256(prompt),
        output_sha256: sha256(result.text),
        started_at: startedAt,
        completed_at: completedAt,
        base44_used: false,
        external_side_effects_authorized: false,
        raw_credential_returned: false,
        ...(result.usage?{usage:result.usage}:{}),
      };
      return {
        status: "completed",
        text: result.text,
        provider: result.provider,
        model: result.model,
        provider_receipt: sha256(JSON.stringify(receiptCore)),
        started_at: startedAt,
        completed_at: completedAt,
        receipt: receiptCore,
        ...(result.usage?{usage:result.usage}:{}),
      };
    },
  };
}

export async function startRavenInferenceGateway({
  host = "127.0.0.1",
  port = 4322,
  controlToken,
  provider,
  model,
  credentialStateDir = "",
  ollamaOrigin,
  openaiOrigin,
  geminiOrigin,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("raven_inference_gateway_must_bind_loopback");
  }
  const token = clean(controlToken, 16000);
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("raven_inference_control_token_too_short");
  const engine = createInferenceEngine({
    provider,
    model,
    credentialStateDir,
    ollamaOrigin,
    openaiOrigin,
    geminiOrigin,
    fetchImpl,
  });
  let closed = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: !closed,
        service: "raven-inference-gateway",
        provider: engine.provider,
        model: engine.model,
        loopback_only: true,
        base44_required: false,
        external_side_effects_authorized: false,
        raw_credentials_exposed: false,
      });
    }
    if (!safeEqual(bearer(req), token)) {
      return json(res, 401, { ok: false, status: "failed", error: "raven_inference_authority_required" });
    }
    if (req.method === "POST" && url.pathname === "/v1/validate") {
      try {
        const body = await readBody(req, 32768);
        if (body?.schema !== "evercraft.raven.inference-validation.request.v1") {
          throw new Error("inference_validation_request_schema_invalid");
        }
        const result = await engine.validate();
        return json(res, 200, {
          ok: true,
          ...result,
          external_side_effects_authorized: false,
        });
      } catch (error) {
        return json(res, 409, {
          ok: false,
          status: "blocked",
          blocked_reason: clean(error?.message || error, 2000),
          inference_performed: false,
          prompt_sent: false,
          base44_used: false,
          external_side_effects_authorized: false,
        });
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/infer") {
      try {
        const body = await readBody(req);
        if (body?.schema !== "evercraft.raven.inference.request.v1") throw new Error("inference_request_schema_invalid");
        if (body?.constraints?.internal_analysis_only !== true) throw new Error("inference_internal_only_required");
        if (body?.constraints?.no_external_actions !== true) throw new Error("inference_no_external_actions_required");
        if (body?.constraints?.no_credential_return !== true) throw new Error("inference_no_credential_return_required");
        const result = await engine.infer({
          request_id: body.request_id,
          role: body.role,
          input: body.input,
          max_output_tokens: body?.constraints?.max_output_tokens ?? null,
        });
        return json(res, 200, {
          ...result,
          receipt: undefined,
          base44_used: false,
          external_side_effects_authorized: false,
        });
      } catch (error) {
        return json(res, 409, {
          status: "blocked",
          blocked_reason: clean(error?.message || error, 2000),
          base44_used: false,
          external_side_effects_authorized: false,
        });
      }
    }
    return json(res, 404, { ok: false, status: "failed", error: "not_found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: "http://" + host + ":" + actualPort,
    engine,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
