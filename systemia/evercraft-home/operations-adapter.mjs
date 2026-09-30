import fs from "node:fs";
import path from "node:path";

function clean(value) {
  return String(value ?? "").trim();
}

export function readYardOverview(stateDir) {
  const dir = clean(stateDir);
  if (!dir) {
    return {
      schema: "evercraft.home.yard-overview.v1",
      state: "not_configured",
      evidence_semantics: "No Yard state directory is configured. No runtime claim is made.",
      summary: { deployments: 0, ready: 0, degraded: 0, other: 0 },
      deployments: [],
    };
  }

  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) {
    return {
      schema: "evercraft.home.yard-overview.v1",
      state: "state_directory_missing",
      evidence_semantics: "Configured Yard state directory is absent. No runtime claim is made.",
      summary: { deployments: 0, ready: 0, degraded: 0, other: 0 },
      deployments: [],
    };
  }

  const deployments = [];
  for (const name of fs.readdirSync(resolved)) {
    if (name.startsWith(".") || !name.endsWith(".json")) continue;
    const file = path.join(resolved, name);
    let record;
    try { record = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { continue; }
    if (!record?.deployment_id) continue;

    deployments.push({
      deployment_id: String(record.deployment_id),
      state: record.state ? String(record.state) : "unknown",
      workload_class: record.receipt?.workload_class || null,
      runtime_fabric: record.receipt?.runtime_fabric || null,
      capacity_node_id: record.receipt?.capacity_node_id || null,
      deployment_receipt: record.receipt?.receipt_hash || null,
      health_verification: record.receipt?.health_verification || null,
      route_verification: record.receipt?.route_verification || null,
      release_ref: record.release_ref || record.receipt?.release_ref || null,
      updated_at: record.updated_at || null,
    });
  }

  deployments.sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  const ready = deployments.filter((row)=>row.state==="ready").length;
  const degraded = deployments.filter((row)=>row.state==="degraded").length;

  return {
    schema: "evercraft.home.yard-overview.v1",
    state: "observed_local_state",
    evidence_semantics: "Sanitized persisted Yard deployment state only. Lease tokens, private endpoints and hidden authority files are excluded. Persisted state is not a fresh live-route verification.",
    summary: {
      deployments: deployments.length,
      ready,
      degraded,
      other: deployments.length-ready-degraded,
    },
    deployments,
  };
}

export function readNetworkOverview(repoRoot) {
  const manifestPath = path.join(repoRoot, "public", ".well-known", "evercraft-network.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      schema: "evercraft.home.network-overview.v1",
      state: "source_missing",
      evidence_semantics: "Network discovery manifest not found. No capability or runtime claim is made.",
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const verification = manifest.machine_routes?.verification || {};
  return {
    schema: "evercraft.home.network-overview.v1",
    state: "declared_public_evidence",
    product_key: manifest.product_key || "evercraft-network",
    name: manifest.name || "Evercraft Network",
    updated_at: manifest.updated_at || null,
    summary: manifest.summary || null,
    boundaries: Array.isArray(manifest.boundaries) ? manifest.boundaries : [],
    verification: {
      observed_at: verification.observed_at || null,
      tools_list_verified: verification.tools_list_verified || [],
      executed_verified: verification.executed_verified || [],
      execution_not_yet_verified: verification.execution_not_yet_verified || [],
    },
    evidence_semantics: "Public capability declaration and dated verification evidence only. This is not private node telemetry, current geographic coverage, or proof that an unverified control action is live.",
  };
}
