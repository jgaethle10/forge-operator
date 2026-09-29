import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EvercraftPassport } from "../passport/passport.mjs";
import { authorizeEvercraftHome, verifyEvercraftSession } from "./identity.mjs";
import { planSystemiaMission, readSystemiaInventory } from "./systemia-adapter.mjs";
import { readNetworkOverview, readYardOverview } from "./operations-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const repoRoot = path.resolve(here, "..", "..");
const registry = JSON.parse(fs.readFileSync(path.join(here, "services.json"), "utf8"));
const host = process.env.EVERCRAFT_HOME_HOST || "127.0.0.1";
const port = Number(process.env.EVERCRAFT_HOME_PORT || 4310);
const authMode = process.env.EVERCRAFT_HOME_AUTH || "local";
const operator = process.env.EVERCRAFT_HOME_OPERATOR || "Operator";
const identitySecret = String(process.env.EVERCRAFT_IDENTITY_SECRET || "").trim();
const passportStateDir = String(process.env.EVERCRAFT_PASSPORT_STATE_DIR || "").trim();
const yardStateDir = String(process.env.EVERCRAFT_YARD_STATE_DIR || "").trim();

if (authMode === "local" && !["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error("Local auth may only bind to loopback. Configure Evercraft Identity before remote exposure.");
}
if (!["local", "passport"].includes(authMode)) throw new Error("unsupported_auth_mode");
if (authMode === "passport" && (!identitySecret || !passportStateDir)) {
  throw new Error("Passport auth requires EVERCRAFT_IDENTITY_SECRET and EVERCRAFT_PASSPORT_STATE_DIR.");
}

const passport = authMode === "passport" ? new EvercraftPassport({ stateDir: passportStateDir }) : null;

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

function sessionFor(req, scope = "home.read") {
  if (authMode === "local") {
    return { ok: true, subject: "local:operator", display_name: operator, authority: "development-only", mode: "local-loopback" };
  }

  const token = cookies(req).evercraft_session;
  if (!token) return { ok: false, status: 401, state: "session_required" };

  try {
    const session = verifyEvercraftSession(token, identitySecret);
    const authorization = authorizeEvercraftHome(passport, session, { scope });
    return {
      ok: true,
      subject: session.subject_ref,
      display_name: session.display_name,
      authority: "evercraft-identity+passport",
      mode: "passport",
      grant_id: authorization.grant_id,
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

function publicService(service) {
  const origin = String(process.env[service.origin_env] || "").trim();
  return { id: service.id, name: service.name, category: service.category, ownership: service.ownership, description: service.description, configured: Boolean(origin) };
}

async function probe(service) {
  const origin = String(process.env[service.origin_env] || "").trim();
  const base = publicService(service);
  if (!origin) return { ...base, state: "not_connected" };

  let target;
  try { target = new URL(service.health_path || "/api/health", origin); }
  catch { return { ...base, state: "invalid_configuration" }; }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(target, { signal: controller.signal, headers: { accept: "application/json,text/plain;q=.9,*/*;q=.5" } });
    return { ...base, state: response.ok ? "reachable" : "degraded", http_status: response.status };
  } catch {
    return { ...base, state: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

const app = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true, service: "evercraft-home", authority: "evercraft", base44_required: false, external_ai_required: false, auth_mode: authMode, timestamp: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = sessionFor(req);
    return json(res, session.ok ? 200 : session.status, session);
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
      return json(res, 200, {
        ok: true,
        subject: session.subject,
        ...result,
      });
    } catch (error) {
      return json(res, 400, { ok: false, state: error?.message || "mission_plan_invalid" });
    }
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
        reachable: owned.filter((item) => item.state === "reachable").length
      },
      services
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { ok: false, error: "method_not_allowed" });

  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);
  if (!target.startsWith(publicDir + path.sep) && target !== path.join(publicDir, "index.html")) return json(res, 403, { ok: false, error: "forbidden" });
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(publicDir, "index.html");
  const ext = path.extname(file);
  const type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { ...securityHeaders, "content-type": type, "cache-control": ext === ".html" ? "no-store" : "public, max-age=300" });
  if (req.method === "HEAD") return res.end();
  res.end(fs.readFileSync(file));
});

app.listen(port, host, () => console.log(`Evercraft Home listening on http://${host}:${port}`));
