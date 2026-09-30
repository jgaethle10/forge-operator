import fs from "node:fs";
import path from "node:path";

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isLegacyProviderUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /(^|\.)base44\.(app|com)$/i.test(url.hostname) ||
      /(^|\.)base44\.app$/i.test(url.hostname) ||
      url.hostname.includes("base44.app");
  } catch {
    return false;
  }
}

export function readRavenOverview(repoRoot) {
  const root = path.resolve(repoRoot);
  const conformance = readJson(path.join(root, "public", "chum", "products", "raven-nexus", "ai-conformance.json"));
  const discovery = readJson(path.join(root, "public", "chum", "products", "raven-nexus", "ai-discovery.json"));
  const matrix = readJson(path.join(root, "nexus-probes", "provider-matrix.json"));
  const suite = readJson(path.join(root, "nexus-probes", "probe-suite.json"));
  const bridge = readJson(path.join(root, "nexus-probes", "bridge-contract.json"));
  const workload = readJson(path.join(root, "nexus-probes", "workload.json"));

  if (!conformance && !discovery && !matrix && !suite) {
    return {
      schema: "evercraft.home.raven-overview.v1",
      state: "source_missing",
      evidence_semantics: "Raven registry and Nexus probe contracts were not found. No runtime or capability claim is made.",
    };
  }

  const providers = Array.isArray(matrix?.providers)
    ? matrix.providers.map((row) => ({
        provider: String(row.provider || ""),
        surface: row.surface ? String(row.surface) : null,
        execution: row.execution ? String(row.execution) : null,
        behavioral_probe_state: row.behavioral_probe_state ? String(row.behavioral_probe_state) : "unknown",
      }))
    : [];

  const cases = Array.isArray(suite?.cases) ? suite.cases : [];
  const enabledCases = cases.filter((row) => row?.enabled === true).length;
  const blockedCases = cases.filter((row) => row?.enabled === false).length;
  const canonicalUrl = conformance?.canonical_url || discovery?.canonical_url || null;

  return {
    schema: "evercraft.home.raven-overview.v1",
    state: "registered_public_capability",
    product_key: conformance?.product_key || discovery?.product_key || "raven-nexus",
    name: conformance?.product || discovery?.name || "Raven Nexus",
    authority: conformance?.authority || discovery?.authority || null,
    human_confirmation_required:
      conformance?.human_confirmation_required === true ||
      discovery?.human_confirmation_required === true,
    boundaries: Array.isArray(conformance?.boundaries)
      ? conformance.boundaries
      : Array.isArray(discovery?.boundaries)
        ? discovery.boundaries
        : [],
    providers,
    provider_summary: {
      declared: providers.length,
      completed_behavioral_probes: providers.filter((row) => row.behavioral_probe_state === "completed").length,
      not_run: providers.filter((row) => row.behavioral_probe_state === "not_run").length,
      other: providers.filter((row) => !["completed", "not_run"].includes(row.behavioral_probe_state)).length,
    },
    probe_suite: {
      updated_at: suite?.updated_at || null,
      cases_total: cases.length,
      enabled_cases: enabledCases,
      blocked_cases: blockedCases,
      bridge_contract_declared: bridge?.endpoint === "POST /v1/probe",
      workload_declared: workload?.workload_id === "nexus-cross-llm-probes",
    },
    runtime: {
      standalone_private_runtime_evidenced: false,
      authorized_nexus_bridge_required_for_behavioral_probes: true,
      public_discovery_route_declared: Boolean(canonicalUrl),
      legacy_public_route_declared: isLegacyProviderUrl(canonicalUrl),
    },
    evidence_semantics:
      "Raven registry, public discovery metadata, and Nexus probe contracts only. This is not proof of a live private Raven human runtime, an authorized provider session, or completed provider behavior.",
  };
}
