import fs from "node:fs";
import path from "node:path";
import { YardOperator } from "../yard/operator.mjs";

const RAVEN_WORKLOAD = "systemia.raven-private-runtime.v1";
const RAVEN_ROUTE_STATE = "private_raven_health_verified_no_public_route";

function clean(value) {
  return String(value ?? "").trim();
}

function readDeploymentRecords(stateDir) {
  if (!stateDir || !fs.existsSync(stateDir)) return [];
  const records = [];
  for (const name of fs.readdirSync(stateDir)) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const file = path.join(stateDir, name);
    try {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      if (record?.deployment_id) records.push(record);
    } catch {}
  }
  return records;
}

function ravenReady(record) {
  return (
    record?.state === "ready" &&
    record?.receipt?.workload_class === RAVEN_WORKLOAD &&
    record?.receipt?.health_verification === "healthy" &&
    record?.receipt?.route_verification === RAVEN_ROUTE_STATE &&
    record?.result?.service_bridge_supported === true &&
    record?.result?.public_route_required === false &&
    record?.result?.control_authority_exposed === false
  );
}

function sanitized(record) {
  if (!record) return null;
  return {
    deployment_id: record.deployment_id,
    workload_class: record.receipt?.workload_class || null,
    state: record.state || null,
    health_verification: record.receipt?.health_verification || null,
    route_verification: record.receipt?.route_verification || null,
    deployment_receipt_hash: record.receipt?.receipt_hash || null,
    instance_id: record.result?.instance_id || null,
    service_bridge_supported: record.result?.service_bridge_supported === true,
    public_route_required: record.result?.public_route_required === true,
    updated_at: record.updated_at || null,
  };
}

export function readRavenPrivateRuntimeStatus({
  yardStateDir,
  deploymentId = "",
} = {}) {
  const stateDir = clean(yardStateDir);
  const configuredId = clean(deploymentId);
  if (!stateDir) {
    return {
      ok: true,
      state: "not_configured",
      ready: false,
      deployment: null,
      candidate_count: 0,
      evidence_semantics:
        "Evercraft Home has no Yard state directory attached, so no private Raven runtime is claimed.",
    };
  }

  const candidates = readDeploymentRecords(stateDir)
    .filter(ravenReady)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  if (configuredId) {
    const selected = candidates.find((row) => row.deployment_id === configuredId) || null;
    return selected
      ? {
          ok: true,
          state: "private_runtime_verified_ready",
          ready: true,
          deployment: sanitized(selected),
          candidate_count: candidates.length,
          evidence_semantics:
            "A persisted Yard deployment proves Raven is ready on Evercraft Compute with private health verification and no public route.",
        }
      : {
          ok: true,
          state: "configured_deployment_not_verified_ready",
          ready: false,
          deployment: null,
          candidate_count: candidates.length,
          evidence_semantics:
            "The configured Raven deployment is not backed by a ready Yard record with the required private health receipt.",
        };
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      state: "held_no_verified_raven_deployment",
      ready: false,
      deployment: null,
      candidate_count: 0,
      evidence_semantics:
        "No persisted Yard deployment currently proves a ready private Raven runtime.",
    };
  }

  if (candidates.length > 1) {
    return {
      ok: true,
      state: "held_multiple_verified_raven_deployments_require_selection",
      ready: false,
      deployment: null,
      candidate_count: candidates.length,
      candidates: candidates.map(sanitized),
      evidence_semantics:
        "Multiple verified Raven deployments exist. Home will not silently choose authority between them.",
    };
  }

  return {
    ok: true,
    state: "private_runtime_verified_ready",
    ready: true,
    deployment: sanitized(candidates[0]),
    candidate_count: 1,
    evidence_semantics:
      "A persisted Yard deployment proves Raven is ready on Evercraft Compute with private health verification and no public route.",
  };
}

export class RavenPrivateRuntimeAdapter {
  constructor({
    yardStateDir,
    deploymentId = "",
  } = {}) {
    this.yardStateDir = clean(yardStateDir);
    this.deploymentId = clean(deploymentId);
    this.yard = this.yardStateDir ? new YardOperator({ stateDir: this.yardStateDir }) : null;
  }

  status() {
    return readRavenPrivateRuntimeStatus({
      yardStateDir: this.yardStateDir,
      deploymentId: this.deploymentId,
    });
  }

  #selectedDeploymentId() {
    const status = this.status();
    if (!status.ready || !status.deployment?.deployment_id || !this.yard) {
      const error = new Error(status.state || "raven_private_runtime_not_ready");
      error.state = status.state || "raven_private_runtime_not_ready";
      throw error;
    }
    return status.deployment.deployment_id;
  }

  async #request({ method, path: requestPath, body = null } = {}) {
    const deploymentId = this.#selectedDeploymentId();
    const response = await this.yard.invokeRavenPrivate(deploymentId, {
      method,
      path: requestPath,
      body,
    });
    const status = Number(response.status || 0);
    if (status < 200 || status >= 300) {
      const state = response.body?.state || response.body?.error || "raven_private_request_failed";
      const error = new Error(state);
      error.state = state;
      error.status = status || 502;
      throw error;
    }
    return {
      ...response.body,
      gateway: {
        deployment_id: deploymentId,
        compute_bridge_receipt_hash: response.compute_bridge_receipt_hash || null,
        allocator_authority_exposed: response.allocator_authority_exposed === true,
        raven_control_authority_exposed: response.raven_control_authority_exposed === true,
      },
    };
  }

  async teams() {
    return await this.#request({ method: "GET", path: "/v1/teams" });
  }

  async createSession({
    subjectRef,
    title = "Founder Command Room",
    lane = "",
    teamComponentKey = "",
  } = {}) {
    const subject = clean(subjectRef);
    if (!subject) throw new Error("raven_subject_ref_required");
    return await this.#request({
      method: "POST",
      path: "/v1/sessions",
      body: {
        subject_ref: subject,
        title: clean(title).slice(0, 160) || "Founder Command Room",
        lane: clean(lane) || undefined,
        team_component_key: clean(teamComponentKey) || undefined,
      },
    });
  }

  async getSession(sessionId) {
    const id = clean(sessionId);
    if (!/^raven_session_[a-zA-Z0-9-]+$/.test(id)) throw new Error("raven_session_id_invalid");
    return await this.#request({
      method: "GET",
      path: "/v1/sessions/" + encodeURIComponent(id),
    });
  }

  async planCommand(sessionId, {
    message,
    lane = "",
  } = {}) {
    const id = clean(sessionId);
    if (!/^raven_session_[a-zA-Z0-9-]+$/.test(id)) throw new Error("raven_session_id_invalid");
    const objective = clean(message);
    if (objective.length < 3) throw new Error("raven_command_too_short");
    return await this.#request({
      method: "POST",
      path: "/v1/sessions/" + encodeURIComponent(id) + "/commands",
      body: {
        message: objective,
        lane: clean(lane) || undefined,
      },
    });
  }
}
