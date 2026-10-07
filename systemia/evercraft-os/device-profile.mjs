import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const classesPath = path.join(here, "device-classes.json");

export function loadDeviceClasses() {
  return JSON.parse(fs.readFileSync(classesPath, "utf8"));
}

export function collectLocalFacts() {
  const cpus = os.cpus();
  return {
    evidence_state: "observed_local",
    platform: os.platform(),
    arch: os.arch(),
    cpu_count: Array.isArray(cpus) ? cpus.length : 0,
    memory_bytes: os.totalmem(),
    hostname_present: Boolean(os.hostname())
  };
}

export function normalizeDeviceClass(deviceClassHint) {
  const classes = loadDeviceClasses().classes;
  const normalized = String(deviceClassHint || "unknown").trim().toLowerCase();
  return Object.hasOwn(classes, normalized) ? normalized : "unknown";
}

export function buildDeviceProfile({
  deviceClassHint = process.env.EVERCRAFT_OS_DEVICE_CLASS || "unknown",
  nodeId = process.env.EVERCRAFT_NODE_ID || null,
  facts = collectLocalFacts()
} = {}) {
  const catalog = loadDeviceClasses();
  const deviceClass = normalizeDeviceClass(deviceClassHint);
  const classContract = catalog.classes[deviceClass];

  const computeCandidate =
    Number.isFinite(facts.cpu_count) &&
    facts.cpu_count > 0 &&
    Number.isFinite(facts.memory_bytes) &&
    facts.memory_bytes > 0;

  const interactiveCandidate = ["laptop", "desktop", "phone", "tablet"].includes(deviceClass);
  const continuousCandidate = ["desktop", "server"].includes(deviceClass);

  return {
    schema: "evercraft.os.device-profile.v1",
    device_class: deviceClass,
    device_class_evidence:
      deviceClass === "unknown" ? "not_established" : "operator_declared",
    node_identity: {
      authority: "nodeseed",
      node_id: nodeId,
      established: Boolean(nodeId)
    },
    host_facts: {
      evidence_state: facts.evidence_state || "observed_local",
      platform: facts.platform || "unknown",
      arch: facts.arch || "unknown",
      cpu_count: Number.isFinite(facts.cpu_count) ? facts.cpu_count : 0,
      memory_bytes: Number.isFinite(facts.memory_bytes) ? facts.memory_bytes : 0,
      hostname_present: Boolean(facts.hostname_present)
    },
    planning_hints: classContract.planning_hints,
    candidate_roles: {
      interactive_human_surface: interactiveCandidate,
      compute_capacity: computeCandidate,
      continuous_residency: continuousCandidate
    },
    capability_claims: {
      camera: "not_established",
      microphone: "not_established",
      location: "not_established",
      telephony: "not_established",
      secure_element: "not_established",
      gpu_acceleration: "not_established"
    },
    authority: {
      execution_granted: false,
      compute_lease_granted: false,
      passport_scope_granted: false,
      payment_authority_granted: false
    },
    placement_note:
      "Candidate roles are planning hints only. Yard, NodeSeed, Passport, Systemia, and Saban remain authoritative for admission, capability, authorization, and placement."
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(buildDeviceProfile(), null, 2) + "\n");
}
