import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EvercraftPassport } from "../passport/passport.mjs";
import { EvercraftIdentity, IdentityRateLimiter } from "../identity/identity.mjs";
import { authorizeEvercraftHome, verifyEvercraftSession } from "./identity.mjs";
import { planSystemiaMission, readSystemiaInventory } from "./systemia-adapter.mjs";
import { readNetworkOverview, readYardOverview } from "./operations-adapter.mjs";
import { readRavenOverview } from "./raven-adapter.mjs";
import { ProviderCredentialVault } from "./credential-vault.mjs";
import { normalizeProviderCredentialRequest } from "./provider-credentials.mjs";
import { readSpatialTwinFile } from "./spatial-twin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const repoRoot = path.resolve(here, "..", "..");
const registry = JSON.parse(fs.readFileSync(path.join(here, "services.json"), "utf8"));

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"
};

function json(res, status, value) {
  res.writeHead(status, { ...securityHeaders, "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function cookies(req) {
  const raw = String(req.headers.cookie || "");
  return Object.fromEntries(raw.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [part, ""];
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

async function readJsonBody(req, limit = 131072) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("request_body_required");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("request_body_invalid_json");
  }
}


function identityKeyring(currentKeyId, currentSecret, previousKeysJson) {
  const keyId = String(currentKeyId || "primary").trim();
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(keyId)) throw new Error("signing_key_id_invalid");
  const secret = String(currentSecret || "").trim();
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("signing_secret_too_short");
  let previous = {};
  if (String(previousKeysJson || "").trim()) {
    try {
      previous = JSON.parse(previousKeysJson);
    } catch {
      throw new Error("identity_previous_keys_invalid_json");
    }
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
      throw new Error("identity_previous_keys_invalid");
    }
  }
  const result = {};
  for (const [id, value] of Object.entries(previous)) {
    const priorId = String(id || "").trim();
    const priorSecret = String(value || "").trim();
    if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(priorId)) throw new Error("signing_key_id_invalid");
    if (Buffer.byteLength(priorSecret, "utf8") < 32) throw new Error("signing_secret_too_short");
    if (priorId === keyId) throw new Error("identity_previous_key_conflicts_with_current");
    result[priorId] = priorSecret;
  }
  result[keyId] = secret;
  return result;
}

export async function startEvercraftHomeServer({
  host = process.env.EVERCRAFT_HOME_HOST || "127.0.0.1",
  port = Number(process.env.EVERCRAFT_HOME_PORT || 4310),
  authMode = process.env.EVERCRAFT_HOME_AUTH || "local",
  operator = process.env.EVERCRAFT_HOME_OPERATOR || "Operator",
  identitySecret = String(process.env.EVERCRAFT_IDENTITY_SECRET || "").trim(),
  identityKeyId = String(process.env.EVERCRAFT_IDENTITY_KEY_ID || "primary").trim(),
  identityPreviousKeysJson = String(process.env.EVERCRAFT_IDENTITY_PREVIOUS_KEYS_JSON || "").trim(),
  passportStateDir = String(process.env.EVERCRAFT_PASSPORT_STATE_DIR || "").trim(),
  yardStateDir = String(process.env.EVERCRAFT_YARD_STATE_DIR || "").trim(),
  identityStateDir = String(process.env.EVERCRAFT_IDENTITY_STATE_DIR || "").trim(),
  credentialStateDir = String(process.env.EVERCRAFT_CREDENTIAL_STATE_DIR || (identityStateDir ? path.join(identityStateDir, "provider-credentials") : "")).trim(),
  sessionTtlSeconds = Number(process.env.EVERCRAFT_HOME_SESSION_TTL_SECONDS || 1800),
  cookieSecure = String(process.env.EVERCRAFT_HOME_COOKIE_SECURE || "true").toLowerCase() !== "false",
  serviceOrigins = process.env,
  spatialStatePath = String(process.env.EVERCRAFT_HOME_SPATIAL_STATE_PATH || "").trim(),
} = {}) {
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (authMode === "local" && !loopback) {
    throw new Error("Local auth may only bind to loopback. Configure Evercraft Identity before remote exposure.");
  }
  if (!["local", "passport"].includes(authMode)) throw new Error("unsupported_auth_mode");
  if (authMode === "passport" && (!identitySecret || !identityStateDir || !passportStateDir)) {
    throw new Error("Passport auth requires signing material, EVERCRAFT_IDENTITY_STATE_DIR and EVERCRAFT_PASSPORT_STATE_DIR.");
  }

  const passport = authMode === "passport" ? new EvercraftPassport({ stateDir: passportStateDir }) : null;
  const signingKeys = authMode === "passport"
    ? identityKeyring(identityKeyId, identitySecret, identityPreviousKeysJson)
    : {};
  const identity = authMode === "passport" && identityStateDir
    ? new EvercraftIdentity({ stateDir: identityStateDir })
    : null;
  const loginLimiter = new IdentityRateLimiter();
  const credentialVault = credentialStateDir ? new ProviderCredentialVault({ stateDir: credentialStateDir }) : null;
  const instanceId = "home_" + randomUUID();
  let closed = false;
  let deploymentReceiptRef = "";

  function homeHealth() {
    return {
      ok: !closed,
      service: "evercraft-home",
      runtime: "Evercraft Compute",
      workload_class: "systemia.evercraft-home.v1",
      authority: "evercraft",
      auth_mode: authMode,
      instance_id: instanceId,
      listen_scope: loopback ? "loopback" : "non_loopback",
      base44_required: false,
      external_ai_required: false,
      legacy_provider_required: false,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
      identity_login_configured: Boolean(identity),
      signing_key_id: authMode === "passport" ? identityKeyId : null,
      accepted_signing_key_count: authMode === "passport" ? Object.keys(signingKeys).length : 0,
      session_revocation_supported: Boolean(identity),
      provider_credential_vault_configured: Boolean(credentialVault),
      spatial_twin_configured: Boolean(spatialStatePath),
    };
  }

  function sessionCookie(token, maxAgeSeconds) {
    return [
      "evercraft_session=" + encodeURIComponent(token),
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      cookieSecure ? "Secure" : "",
      "Max-Age=" + Math.max(0, Number(maxAgeSeconds || 0)),
    ].filter(Boolean).join("; ");
  }

  function loginRateKey(req, login) {
    return String(login || "").toLowerCase() + "@" + String(req.socket?.remoteAddress || "unknown");
  }

  function sessionFor(req, scope = "home.read") {
    if (authMode === "local") {
      return { ok: true, subject: "local:operator", display_name: operator, authority: "development-only", mode: "local-loopback" };
    }

    const token = cookies(req).evercraft_session;
    if (!token) return { ok: false, status: 401, state: "session_required" };

    try {
      const session = verifyEvercraftSession(token, signingKeys);
      identity.assertSessionActive(session);
      const authorization = authorizeEvercraftHome(passport, session, { scope });
      return {
        ok: true,
        subject: session.subject_ref,
        display_name: session.display_name,
        session_id: session.session_id,
        signing_key_id: session.signing_key_id,
        authority: "evercraft-identity+passport",
        mode: "passport",
        grant_id: authorization.grant_id,
        issued_at: session.issued_at,
        expires_at: session.expires_at,
      };
    } catch (error) {
      return {
        ok: false,
        status: error?.message === "home_access_denied" ? 403 : 401,
        state: error?.message || "session_invalid",
      };
    }
  }

  function publicService(service) {
    const origin = String(serviceOrigins?.[service.origin_env] || "").trim();
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      ownership: service.ownership,
      description: service.description,
      configured: Boolean(origin),
    };
  }

  async function probe(service) {
    const origin = String(serviceOrigins?.[service.origin_env] || "").trim();
    const base = publicService(service);
    if (!origin) return { ...base, state: "not_connected" };

    let target;
    try {
      target = new URL(service.health_path || "/api/health", origin);
    } catch {
      return { ...base, state: "invalid_configuration" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(target, {
        signal: controller.signal,
        headers: { accept: "application/json,text/plain;q=.9,*/*;q=.5" },
      });
      return { ...base, state: response.ok ? "reachable" : "degraded", http_status: response.status };
    } catch {
      return { ...base, state: "unreachable" };
    } finally {
      clearTimeout(timer);
    }
  }

  const app = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/health")) {
      return json(res, 200, {
        ...homeHealth(),
        timestamp: new Date().toISOString(),
      });

    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      if (authMode !== "passport" || !identity) {
        return json(res, 503, { ok: false, state: "identity_login_not_configured" });
      }
      try {
        const body = await readJsonBody(req, 32768);
        const login = String(body.login || "").trim();
        const rateKey = loginRateKey(req, login);
        loginLimiter.assertAllowed(rateKey);
        let authentication;
        try {
          authentication = identity.authenticatePassword({
            login,
            password: String(body.password || ""),
          });
        } catch (error) {
          loginLimiter.recordFailure(rateKey);
          throw error;
        }

        const authorization = passport.authorize({
          subject_ref: authentication.subject_ref,
          product: "evercraft-home",
          scope: "home.read",
          at: new Date().toISOString(),
        });
        if (authorization.decision !== "allow") {
          throw new Error("home_access_denied");
        }

        const issued = identity.issueSession(authentication, {
          signingSecret: identitySecret,
          signingKeyId: identityKeyId,
          ttlSeconds: sessionTtlSeconds,
        });
        loginLimiter.recordSuccess(rateKey);
        const bodyOut = JSON.stringify({
          ok: true,
          state: "authenticated",
          subject: issued.session.subject_ref,
          display_name: issued.session.display_name,
          expires_at: issued.session.expires_at,
          authority: "evercraft-identity+passport",
        });
        res.writeHead(200, {
          ...securityHeaders,
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
          "set-cookie": sessionCookie(issued.token, sessionTtlSeconds),
        });
        return res.end(bodyOut);
      } catch (error) {
        const message = String(error?.message || "identity_login_failed");
        const status = message === "identity_login_rate_limited"
          ? 429
          : message === "home_access_denied"
            ? 403
            : 401;
        return json(res, status, { ok: false, state: message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const token = cookies(req).evercraft_session;
      if (token && identity) {
        try {
          const session = verifyEvercraftSession(token, signingKeys);
          identity.revokeSession({
            sessionId: session.session_id,
            subjectRef: session.subject_ref,
            reason: "signed_out",
          });
        } catch {}
      }
      res.writeHead(200, {
        ...securityHeaders,
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "set-cookie": sessionCookie("", 0),
      });
      return res.end(JSON.stringify({ ok: true, state: "signed_out" }));
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/revoke-all") {
      const session = sessionFor(req, "home.identity.sessions.manage");
      if (!session.ok) return json(res, session.status, session);
      const revoked = identity.revokeSubjectSessions({
        subjectRef: session.subject,
        reason: "sign_out_everywhere",
      });
      res.writeHead(200, {
        ...securityHeaders,
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "set-cookie": sessionCookie("", 0),
      });
      return res.end(JSON.stringify({
        ok: true,
        state: revoked.state,
        subject: revoked.subject_ref,
        not_before: revoked.not_before,
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      const session = sessionFor(req);
      return json(res, session.ok ? 200 : session.status, session);
    }

    const householdProviderCredentialMatch = url.pathname.match(
      /^\/api\/credentials\/providers\/(google-places|kroger)(\/status)?$/
    );
    if (householdProviderCredentialMatch && req.method === "GET" && householdProviderCredentialMatch[2]) {
      const session = sessionFor(req, "home.identity.sessions.manage");
      if (!session.ok) return json(res, session.status, session);
      if (!credentialVault) return json(res, 503, { ok: false, state: "credential_vault_not_configured" });
      const provider = householdProviderCredentialMatch[1];
      return json(res, 200, {
        ok: true,
        provider,
        credentials: credentialVault.list({ provider }),
        secret_material_returned: false,
      });
    }

    if (householdProviderCredentialMatch && req.method === "POST" && !householdProviderCredentialMatch[2]) {
      const session = sessionFor(req, "home.identity.sessions.manage");
      if (!session.ok) return json(res, session.status, session);
      if (!credentialVault) return json(res, 503, { ok: false, state: "credential_vault_not_configured" });
      try {
        const body = await readJsonBody(req, 16384);
        const normalized = normalizeProviderCredentialRequest(householdProviderCredentialMatch[1], body);
        const credential = credentialVault.put({
          ...normalized,
          actorRef: session.subject,
        });
        return json(res, 201, {
          ok: true,
          state: "credential_sealed",
          provider: normalized.provider,
          credential,
          secret_material_returned: false,
          plaintext_persisted: false,
          authority: "evercraft-home+provider-credential-vault",
        });
      } catch (error) {
        return json(res, 400, { ok: false, state: error?.message || "credential_store_failed" });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/credentials/providers/alpaca/status") {
      const session = sessionFor(req, "home.identity.sessions.manage");
      if (!session.ok) return json(res, session.status, session);
      if (!credentialVault) return json(res, 503, { ok: false, state: "credential_vault_not_configured" });
      return json(res, 200, {
        ok: true,
        provider: "alpaca",
        credentials: credentialVault.list({ provider: "alpaca" }),
        secret_material_returned: false,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/credentials/providers/alpaca") {
      const session = sessionFor(req, "home.identity.sessions.manage");
      if (!session.ok) return json(res, session.status, session);
      if (!credentialVault) return json(res, 503, { ok: false, state: "credential_vault_not_configured" });
      try {
        const body = await readJsonBody(req, 16384);
        const credential = credentialVault.put({
          provider: "alpaca",
          environment: String(body.environment || "live"),
          label: String(body.label || "daytrade-lens"),
          apiKeyId: String(body.api_key_id || ""),
          apiSecret: String(body.api_secret || ""),
          actorRef: session.subject,
        });
        return json(res, 201, {
          ok: true,
          state: "credential_sealed",
          credential,
          secret_material_returned: false,
          plaintext_persisted: false,
          authority: "evercraft-home+provider-credential-vault",
        });
      } catch (error) {
        return json(res, 400, { ok: false, state: error?.message || "credential_store_failed" });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/systemia/inventory") {
      const session = sessionFor(req, "home.systemia.read");
      if (!session.ok) return json(res, session.status, session);
      return json(res, 200, {
        ok: true,
        subject: session.subject,
        authority: "systemia-read-only",
        inventory: readSystemiaInventory(repoRoot),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/systemia/plan") {
      const session = sessionFor(req, "home.systemia.plan");
      if (!session.ok) return json(res, session.status, session);
      try {
        const request = await readJsonBody(req);
        const result = planSystemiaMission(request, repoRoot);
        return json(res, 200, { ok: true, subject: session.subject, ...result });
      } catch (error) {
        return json(res, 400, { ok: false, state: error?.message || "mission_plan_invalid" });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/raven/overview") {
      const session = sessionFor(req);
      if (!session.ok) return json(res, session.status, session);
      return json(res, 200, {
        ok: true,
        subject: session.subject,
        ...readRavenOverview(repoRoot),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/yard/overview") {
      const session = sessionFor(req, "home.yard.read");
      if (!session.ok) return json(res, session.status, session);
      return json(res, 200, { ok: true, subject: session.subject, ...readYardOverview(yardStateDir) });
    }

    if (req.method === "GET" && url.pathname === "/api/network/overview") {
      const session = sessionFor(req, "home.network.read");
      if (!session.ok) return json(res, session.status, session);
      return json(res, 200, { ok: true, subject: session.subject, ...readNetworkOverview(repoRoot) });
    }

    if (req.method === "GET" && url.pathname === "/api/home/spatial-twin") {
      const session = sessionFor(req, "home.read");
      if (!session.ok) return json(res, session.status, session);
      const twin = readSpatialTwinFile(spatialStatePath);
      return json(res, twin.ok ? 200 : 503, {
        ok: twin.ok,
        subject: session.subject,
        state: twin.state,
        scene: twin.scene,
        world: twin.world || null,
        device_control_authority: false,
        public_exposure_allowed: false,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/overview") {
      const session = sessionFor(req);
      if (!session.ok) return json(res, session.status, session);

      const services = await Promise.all(registry.services.map(probe));
      const owned = services.filter((item) => item.ownership === "evercraft-owned");
      return json(res, 200, {
        ok: true,
        schema: "evercraft.home-overview.v1",
        timestamp: new Date().toISOString(),
        subject: session.subject,
        direct_mode_default: true,
        control_plane: {
          owned_services: owned.length,
          configured: owned.filter((item) => item.configured).length,
          reachable: owned.filter((item) => item.state === "reachable").length,
        },
        services,
      });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, { ok: false, error: "method_not_allowed" });
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const target = path.resolve(publicDir, relative);
    if (!target.startsWith(publicDir + path.sep) && target !== path.join(publicDir, "index.html")) {
      return json(res, 403, { ok: false, error: "forbidden" });
    }

    const file = fs.existsSync(target) && fs.statSync(target).isFile()
      ? target
      : path.join(publicDir, "index.html");
    const ext = path.extname(file);
    const type = ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : "application/octet-stream";
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": type,
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    if (req.method === "HEAD") return res.end();
    res.end(fs.readFileSync(file));
  });

  await new Promise((resolve, reject) => {
    app.once("error", reject);
    app.listen(port, host, resolve);
  });

  const address = app.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    schema: "evercraft.home.runtime.v1",
    instanceId,
    url,
    host,
    port: actualPort,
    authMode,
    health: async () => homeHealth(),
    setDeploymentReceipt: (receiptRef) => {
      const ref = String(receiptRef || "").trim();
      if (!ref) throw new Error("deployment_receipt_ref_required");
      deploymentReceiptRef = ref;
      return homeHealth();
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) =>
        app.close((error) => error ? reject(error) : resolve())
      );
    },
  };
}

async function main() {
  const runtime = await startEvercraftHomeServer();
  console.log(`Evercraft Home listening on ${runtime.url}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
