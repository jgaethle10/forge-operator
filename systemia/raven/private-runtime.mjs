import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { admitMission, machineInventory } from "../control-plane/control-plane.mjs";

const TEAM_LABELS = Object.freeze({
  "systemia-organism": "Systemia",
  "yard-operator": "The Yard",
  "signal-fabric": "Signal Fabric",
  "evercraft-network": "Evercraft Network",
  "chum": "Publishing & Discovery",
  "evercraft-compute": "Evercraft Compute",
  "kaidance-collider": "Continuity",
  "beast-mode": "Artifact Logistics",
  "media-studio": "Media Studio",
  "evercraft-context-fabric": "Context Fabric",
  "evercraft-intake-fabric": "Intake Fabric",
  "evercraft-passport": "Passport",
  "evercraft-meter": "Meter",
  "evercraft-interaction-ledger": "Interaction Ledger",
});

const LANES = Object.freeze({
  operations: "analyze",
  research: "research",
  security: "security",
  publishing: "publish",
  infrastructure: "deploy",
  quality: "qa",
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
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

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + "." + randomBytes(4).toString("hex") + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function readBody(req, limit = 131072) {
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

function bearer(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function sessionFile(stateDir, sessionId) {
  return path.join(stateDir, "sessions", sha256(sessionId).slice(7) + ".json");
}

function commandReceipt(command) {
  const stable = {
    schema: command.schema,
    command_id: command.command_id,
    session_id: command.session_id,
    subject_ref: command.subject_ref,
    lane: command.lane,
    message_sha256: command.message_sha256,
    mission_key: command.mission_key,
    routed_components: command.routed_components,
    holds: command.holds,
    execution_authority_granted: false,
    ai_inference_used: false,
    planned_at: command.planned_at,
  };
  return sha256(JSON.stringify(stable));
}

function loadSession(stateDir, sessionId) {
  const file = sessionFile(stateDir, sessionId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveSession(stateDir, session) {
  atomicJson(sessionFile(stateDir, session.session_id), session);
}

export function ravenPrivateTeams(repoRoot = process.cwd()) {
  const inventory = machineInventory(repoRoot);
  return inventory.components.map((component) => ({
    component_key: component.component_key,
    label: TEAM_LABELS[component.component_key] || component.component_key,
    role: component.role,
    source_state: component.state,
  }));
}

export function planPrivateRavenCommand({
  sessionId,
  subjectRef,
  lane = "operations",
  message,
} = {}, repoRoot = process.cwd(), now = new Date()) {
  const session = clean(sessionId);
  const subject = clean(subjectRef);
  const laneKey = clean(lane).toLowerCase() || "operations";
  const objective = clean(message);
  if (!session) throw new Error("raven_session_id_required");
  if (!subject) throw new Error("raven_subject_ref_required");
  if (!LANES[laneKey]) throw new Error("raven_lane_invalid");
  if (objective.length < 3) throw new Error("raven_command_too_short");
  if (objective.length > 4000) throw new Error("raven_command_too_long");

  const plan = admitMission({
    request: {
      objective,
      success_condition:
        "Systemia produces a bounded, receipted plan for the Raven command without granting execution authority.",
      context_refs: [
        "raven-private-runtime:" + session,
        "subject:" + subject,
      ],
      tasks: [{
        work_key: "raven-command",
        title: objective,
        work_type: LANES[laneKey],
        context_required: ["research", "security", "quality"].includes(laneKey),
      }],
    },
    rootDir: repoRoot,
    now,
  });

  const routed = [...new Set(plan.dispatch.map((row) => row.specialist_component).filter(Boolean))];
  const command = {
    schema: "evercraft.raven.private-command.v1",
    command_id: "raven_command_" + randomUUID(),
    session_id: session,
    subject_ref: subject,
    lane: laneKey,
    work_type: LANES[laneKey],
    message: objective,
    message_sha256: sha256(objective),
    mission_key: plan.mission.mission_key,
    routed_components: routed,
    routed_teams: routed.map((key) => ({
      component_key: key,
      label: TEAM_LABELS[key] || key,
    })),
    holds: plan.dispatch.map((row) => row.hold).filter(Boolean),
    execution_gate_required: plan.dispatch.some((row) => row.execution_gate_required === true),
    execution_authority_granted: false,
    ai_inference_used: false,
    model_provider_used: null,
    standalone_runtime: true,
    systemia_authority: plan.receipt.authority,
    planned_at: now.toISOString(),
    plan_receipt_hash: plan.receipt.receipt_hash,
    evidence_semantics:
      "Raven recorded the founder command and Systemia routing plan. No AI inference, specialist execution, deployment, publication, external communication, purchase, or other consequential action occurred.",
  };
  command.receipt_hash = commandReceipt(command);
  return { command, plan };
}

export async function startRavenPrivateRuntime({
  stateDir,
  repoRoot = process.cwd(),
  host = "127.0.0.1",
  port = 0,
  controlToken,
} = {}) {
  const resolvedState = path.resolve(clean(stateDir) || "");
  if (!clean(stateDir)) throw new Error("raven_state_dir_required");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("raven_private_runtime_must_bind_loopback");
  }
  const token = clean(controlToken);
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("raven_control_token_too_short");
  fs.mkdirSync(path.join(resolvedState, "sessions"), { recursive: true, mode: 0o700 });

  const instanceId = "raven_" + randomUUID();
  let closed = false;
  let deploymentReceiptRef = "";

  function health() {
    return {
      ok: !closed,
      service: "raven-nexus-private",
      runtime: "Evercraft Compute",
      workload_class: "systemia.raven-nexus.v1",
      authority: "systemia-organism",
      instance_id: instanceId,
      loopback_only: true,
      provider_independent_boot: true,
      external_ai_required: false,
      ai_inference_enabled: false,
      command_planning_enabled: true,
      execution_authority_granted: false,
      persistent_session_ledger: true,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
    };
  }

  function authorize(req) {
    return safeEqual(bearer(req), token);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return json(res, 200, health());
    }

    if (!authorize(req)) {
      return json(res, 401, { ok: false, state: "raven_runtime_authority_required" });
    }

    if (req.method === "GET" && url.pathname === "/v1/teams") {
      return json(res, 200, {
        ok: true,
        schema: "evercraft.raven.private-team-directory.v1",
        teams: ravenPrivateTeams(repoRoot),
        evidence_semantics:
          "Team directory reflects Systemia source inventory and routing roles. Source presence is not proof of a healthy live specialist runtime.",
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/sessions") {
      try {
        const body = await readBody(req, 32768);
        const subject = clean(body.subject_ref);
        if (!subject) throw new Error("raven_subject_ref_required");
        const session = {
          schema: "evercraft.raven.private-session.v1",
          session_id: "raven_session_" + randomUUID(),
          subject_ref: subject,
          label: clean(body.label).slice(0, 160) || "Founder Command Room",
          state: "open",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          commands: [],
          ai_inference_enabled: false,
          execution_authority_granted: false,
        };
        saveSession(resolvedState, session);
        return json(res, 201, { ok: true, session });
      } catch (error) {
        return json(res, 400, { ok: false, state: error?.message || "raven_session_create_failed" });
      }
    }

    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)(?:\/commands)?$/);
    if (match) {
      const sessionId = decodeURIComponent(match[1]);
      const session = loadSession(resolvedState, sessionId);
      if (!session) return json(res, 404, { ok: false, state: "raven_session_not_found" });

      if (req.method === "GET" && !url.pathname.endsWith("/commands")) {
        return json(res, 200, { ok: true, session });
      }

      if (req.method === "POST" && url.pathname.endsWith("/commands")) {
        try {
          if (session.state !== "open") throw new Error("raven_session_closed");
          const body = await readBody(req);
          const planned = planPrivateRavenCommand({
            sessionId,
            subjectRef: session.subject_ref,
            lane: body.lane,
            message: body.message,
          }, repoRoot);
          session.commands.push(planned.command);
          session.updated_at = new Date().toISOString();
          saveSession(resolvedState, session);
          return json(res, 200, {
            ok: true,
            state: "planned_not_executed",
            command: planned.command,
          });
        } catch (error) {
          return json(res, 400, {
            ok: false,
            state: error?.message || "raven_command_plan_failed",
            execution_authority_granted: false,
          });
        }
      }
    }

    return json(res, 404, { ok: false, state: "not_found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = "http://" + host + ":" + actualPort;

  return {
    schema: "evercraft.raven.private-runtime.v1",
    instanceId,
    url,
    health,
    setDeploymentReceipt(receiptRef) {
      const ref = clean(receiptRef);
      if (!ref) throw new Error("deployment_receipt_ref_required");
      deploymentReceiptRef = ref;
      return health();
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
