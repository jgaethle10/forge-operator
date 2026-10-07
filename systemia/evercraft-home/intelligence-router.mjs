import { randomUUID } from "node:crypto";
import { createInferenceEngine } from "../raven/inference-gateway.mjs";
import { executeRavenCommand, planRavenCommand } from "./raven-command-adapter.mjs";

function clean(value, max = 50000) {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function hasCredential(vault, provider) {
  if (!vault) return false;
  try {
    return Array.isArray(vault.list({ provider })) && vault.list({ provider }).length > 0;
  } catch {
    return false;
  }
}

function modelFor(provider, env = {}) {
  if (provider === "openai") return clean(env.EVERCRAFT_OPENAI_MODEL || env.RAVEN_OPENAI_MODEL, 300);
  if (provider === "gemini") return clean(env.EVERCRAFT_GEMINI_MODEL || env.RAVEN_GEMINI_MODEL, 300);
  return "";
}

function ravenInferenceReadiness(credentialVault, env = {}) {
  const provider = clean(env.RAVEN_INFERENCE_PROVIDER, 80).toLowerCase();
  const model = clean(env.RAVEN_INFERENCE_MODEL, 300);
  if (!provider || !model) {
    return {
      ready: false,
      state: "inference_not_configured",
      provider: provider || null,
      model: model || null,
      external: provider === "openai" || provider === "gemini",
    };
  }
  if (provider === "openai" || provider === "gemini") {
    const credentialReady = hasCredential(credentialVault, provider);
    return {
      ready: credentialReady,
      state: credentialReady ? "ready" : "inference_credential_not_connected",
      provider,
      model,
      external: true,
    };
  }
  if (provider === "ollama") {
    const validated = String(env.RAVEN_LOCAL_INFERENCE_READY || "").toLowerCase() === "true";
    return {
      ready: validated,
      state: validated ? "ready" : "local_inference_not_verified",
      provider,
      model,
      external: false,
    };
  }
  return {
    ready: false,
    state: "inference_provider_unsupported",
    provider,
    model,
    external: false,
  };
}

export function intelligenceOptions({
  credentialVault = null,
  ravenConfigured = false,
  env = {},
} = {}) {
  const openaiModel = modelFor("openai", env);
  const geminiModel = modelFor("gemini", env);
  const ravenInference = ravenInferenceReadiness(credentialVault, env);
  const ravenReady = Boolean(ravenConfigured && ravenInference.ready);
  const options = [
    {
      key: "evercraft",
      label: "Evercraft AI",
      kind: "owned_orchestrator",
      available: ravenReady,
      state: !ravenConfigured ? "runtime_not_attached" : ravenInference.state,
      model: ravenInference.model || null,
      inference_provider: ravenInference.provider || null,
      owned_orchestration: true,
      external_inference: ravenInference.external === true,
      detail: !ravenConfigured
        ? "The owned Raven runtime is not attached to this Home instance yet."
        : ravenReady
          ? "Raven Nexus and Systemia own orchestration, policy and receipts. Inference is supplied through the configured replaceable private gateway."
          : "Raven Nexus is attached, but its configured inference path is not ready yet.",
      external_provider: ravenInference.external === true,
    },
    {
      key: "openai",
      label: "ChatGPT / OpenAI",
      kind: "optional_specialist",
      available: Boolean(openaiModel && hasCredential(credentialVault, "openai")),
      state: !openaiModel
        ? "model_not_configured"
        : hasCredential(credentialVault, "openai")
          ? "ready"
          : "credential_not_connected",
      model: openaiModel || null,
      detail: "Optional specialist. Your prompt is sent to OpenAI only when you explicitly select this option.",
      external_provider: true,
    },
    {
      key: "gemini",
      label: "Gemini",
      kind: "optional_specialist",
      available: Boolean(geminiModel && hasCredential(credentialVault, "gemini")),
      state: !geminiModel
        ? "model_not_configured"
        : hasCredential(credentialVault, "gemini")
          ? "ready"
          : "credential_not_connected",
      model: geminiModel || null,
      detail: "Optional specialist. Your prompt is sent to Gemini only when you explicitly select this option.",
      external_provider: true,
    },
  ];
  return {
    schema: "evercraft.home.intelligence-options.v1",
    default_mode: "direct",
    default_provider: "evercraft",
    authority: "evercraft+systemia",
    options,
    external_provider_required: false,
  };
}

export async function askIntelligence({
  provider = "evercraft",
  message,
  lane = "operations",
  credentialVault = null,
  credentialStateDir = "",
  ravenConfigured = false,
  ravenWorkBridgeUrl = "",
  ravenWorkBridgeToken = "",
  ravenReceiptDir = "",
  env = {},
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}, repoRoot) {
  const providerKey = clean(provider, 80).toLowerCase();
  const objective = clean(message);
  if (objective.length < 3) throw new Error("intelligence_message_too_short");

  const options = intelligenceOptions({ credentialVault, ravenConfigured, env });
  const selected = options.options.find((row) => row.key === providerKey);
  if (!selected) throw new Error("intelligence_provider_invalid");
  if (!selected.available) {
    return {
      schema: "evercraft.home.intelligence-response.v1",
      state: "blocked",
      provider: providerKey,
      provider_label: selected.label,
      blocker: selected.state,
      output: null,
      systemia_authority: "systemia-organism",
      external_side_effects_authorized: false,
      external_provider_used: false,
      evidence_semantics: "The requested intelligence option is not currently available on this Home instance. No provider call was made.",
    };
  }

  if (providerKey === "evercraft") {
    const result = await executeRavenCommand({
      message: objective,
      lane,
      bridgeUrl: ravenWorkBridgeUrl,
      bridgeToken: ravenWorkBridgeToken,
      receiptDir: ravenReceiptDir,
      fetchImpl,
      now,
    }, repoRoot);
    return {
      schema: "evercraft.home.intelligence-response.v1",
      state: result.state,
      provider: "evercraft",
      provider_label: selected.label,
      output: result.output,
      blocker: result.blocker,
      mission_key: result.mission_key,
      receipt: result.receipt,
      systemia_authority: result.systemia_authority,
      external_side_effects_authorized: false,
      external_provider_used: selected.external_inference === true,
      inference_provider: selected.inference_provider || null,
      inference_model: selected.model || null,
      evidence_semantics: selected.external_inference === true
        ? result.evidence_semantics + " Raven/Systemia retained orchestration authority while a replaceable external model supplied bounded inference."
        : result.evidence_semantics,
    };
  }

  const planned = planRavenCommand({ message: objective, lane }, repoRoot);
  const model = modelFor(providerKey, env);
  const engine = createInferenceEngine({
    provider: providerKey,
    model,
    credentialStateDir,
    fetchImpl,
    now,
  });
  const requestId = "home-intelligence-" + randomUUID();
  const result = await engine.infer({
    request_id: requestId,
    role: "evercraft-home-selected-specialist",
    input: objective,
  });

  return {
    schema: "evercraft.home.intelligence-response.v1",
    state: "executed",
    provider: providerKey,
    provider_label: selected.label,
    model: result.model,
    mission_key: planned.mission_key,
    output: {
      state: "completed",
      summary: result.text,
      provider: result.provider,
      model: result.model,
      response_sha256: result.receipt?.output_sha256 || null,
    },
    receipt: {
      provider_receipt: result.provider_receipt,
      prompt_sha256: result.receipt?.prompt_sha256 || null,
      output_sha256: result.receipt?.output_sha256 || null,
      started_at: result.started_at,
      completed_at: result.completed_at,
    },
    systemia_authority: planned.systemia_authority,
    external_side_effects_authorized: false,
    external_provider_used: true,
    evidence_semantics: "Systemia admitted the request, then the founder-selected external model performed internal analysis only. No publication, deployment, payment, purchase, account mutation, or external messaging was authorized.",
  };
}
