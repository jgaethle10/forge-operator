import { createHash } from "node:crypto";
import { resolveCompetitionProviderSecrets, competitionProviderSecretStatus } from "../raven/provider-secret-boundary.mjs";

const DEFAULT_KAGGLE_BASE = "https://www.kaggle.com/api/v1";
const DEFAULT_NUMERAI_URL = "https://api-tournament.numer.ai/";

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return "invalid"; }
}

function kaggleAuthorization(secret) {
  if (!secret) return "";
  if (secret.mode === "bearer") return "Bearer " + secret.access_token;
  if (secret.mode === "basic") {
    return "Basic " + Buffer.from(secret.username + ":" + secret.key).toString("base64");
  }
  return "";
}

function numeraiAuthorization(secret) {
  if (!secret) return "";
  return "Token " + secret.public_id + "$" + secret.secret_key;
}

async function requestJson(url, init, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

function providerReceipt({ provider, state, httpStatus = null, itemCount = null, accountObserved = false, endpoint, detail = null }) {
  const body = {
    schema: "evercraft.systemia.competition-provider-receipt.v1",
    provider,
    state,
    http_status: httpStatus,
    item_count: itemCount,
    account_observed: accountObserved,
    endpoint_host: safeHost(endpoint),
    secret_values_persisted: false,
    base44_used: false,
    public_fabric_used: false,
    submission_attempted: false,
    staking_attempted: false,
    detail,
    observed_at: new Date().toISOString(),
  };
  return { ...body, receipt_hash: sha256(JSON.stringify(body)) };
}

export async function probeKaggle({
  env = process.env,
  fetchImpl = fetch,
  baseUrl = DEFAULT_KAGGLE_BASE,
} = {}) {
  const secrets = resolveCompetitionProviderSecrets(env);
  if (!secrets.kaggle) {
    return providerReceipt({
      provider: "kaggle",
      state: "held_missing_credentials",
      endpoint: baseUrl,
      detail: "Raven Kaggle credential binding is not configured in this runtime.",
    });
  }

  const endpoint = new URL("/api/v1/competitions/list", baseUrl).toString();
  const url = new URL(endpoint);
  url.searchParams.set("group", "entered");
  url.searchParams.set("page", "1");

  let result;
  try {
    result = await requestJson(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: kaggleAuthorization(secrets.kaggle),
        "user-agent": "Evercraft-Systemia-Competition-Scout/1.0",
      },
    }, { fetchImpl });
  } catch (error) {
    return providerReceipt({
      provider: "kaggle",
      state: error?.name === "AbortError" ? "provider_timeout" : "provider_unreachable",
      endpoint,
      detail: String(error?.name || "request_failed"),
    });
  }

  if (result.status === 401 || result.status === 403) {
    return providerReceipt({
      provider: "kaggle",
      state: "auth_rejected",
      httpStatus: result.status,
      endpoint,
    });
  }
  if (!result.ok) {
    return providerReceipt({
      provider: "kaggle",
      state: "provider_error",
      httpStatus: result.status,
      endpoint,
    });
  }

  const rows = Array.isArray(result.body) ? result.body : [];
  return providerReceipt({
    provider: "kaggle",
    state: "authenticated_listing_verified",
    httpStatus: result.status,
    itemCount: rows.length,
    accountObserved: true,
    endpoint,
  });
}

export async function probeNumerai({
  env = process.env,
  fetchImpl = fetch,
  endpoint = DEFAULT_NUMERAI_URL,
} = {}) {
  const secrets = resolveCompetitionProviderSecrets(env);
  if (!secrets.numerai) {
    return providerReceipt({
      provider: "numerai",
      state: "held_missing_credentials",
      endpoint,
      detail: "Raven Numerai credential binding is not configured in this runtime.",
    });
  }

  const query = [
    "query EvercraftRavenProbe {",
    "  account { username }",
    "  rounds(tournament: 8, status: OPEN, limit: 1) { number }",
    "}",
  ].join("\n");

  let result;
  try {
    result = await requestJson(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: numeraiAuthorization(secrets.numerai),
        "user-agent": "Evercraft-Systemia-Competition-Scout/1.0",
      },
      body: JSON.stringify({ query }),
    }, { fetchImpl });
  } catch (error) {
    return providerReceipt({
      provider: "numerai",
      state: error?.name === "AbortError" ? "provider_timeout" : "provider_unreachable",
      endpoint,
      detail: String(error?.name || "request_failed"),
    });
  }

  if (result.status === 401 || result.status === 403) {
    return providerReceipt({
      provider: "numerai",
      state: "auth_rejected",
      httpStatus: result.status,
      endpoint,
    });
  }
  if (!result.ok || Array.isArray(result.body?.errors)) {
    return providerReceipt({
      provider: "numerai",
      state: "provider_error",
      httpStatus: result.status,
      endpoint,
      detail: Array.isArray(result.body?.errors) ? "graphql_errors_present" : null,
    });
  }

  const accountObserved = Boolean(result.body?.data?.account?.username);
  const rounds = Array.isArray(result.body?.data?.rounds) ? result.body.data.rounds : [];
  return providerReceipt({
    provider: "numerai",
    state: accountObserved ? "authenticated_listing_verified" : "authenticated_account_unverified",
    httpStatus: result.status,
    itemCount: rounds.length,
    accountObserved,
    endpoint,
  });
}

export async function runCompetitionProviderProbes(options = {}) {
  const env = options.env || process.env;
  const secrets = resolveCompetitionProviderSecrets(env);
  const [kaggle, numerai] = await Promise.all([
    probeKaggle({ ...options, env }),
    probeNumerai({ ...options, env }),
  ]);

  const providers = [kaggle, numerai];
  const verified = providers.filter((row) => row.state === "authenticated_listing_verified").length;
  const held = providers.filter((row) => row.state.startsWith("held_")).length;
  const failed = providers.length - verified - held;

  return {
    schema: "evercraft.systemia.competition-provider-probe-suite.v1",
    route: ["systemia", "raven_nexus", "provider_api"],
    secret_status: competitionProviderSecretStatus(secrets),
    base44_used: false,
    public_fabric_used: false,
    submission_authority_enabled: false,
    staking_authority_enabled: false,
    providers,
    summary: {
      provider_count: providers.length,
      verified_count: verified,
      held_count: held,
      failed_count: failed,
      state: failed > 0 ? "degraded" : verified > 0 ? "ready_read_only" : "held",
    },
  };
}
