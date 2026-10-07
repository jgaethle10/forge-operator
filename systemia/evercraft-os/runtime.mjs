import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(here, "os-manifest.json");

export function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function inspectComponent(component, root = repoRoot) {
  const resolved = path.resolve(root, component.anchor);
  const insideRoot = resolved === root || resolved.startsWith(root + path.sep);

  if (!insideRoot) {
    return {
      ...component,
      source_state: "rejected",
      reason: "anchor_outside_repository"
    };
  }

  return {
    ...component,
    source_state: fs.existsSync(resolved) ? "present" : "missing",
    reason: fs.existsSync(resolved) ? null : "anchor_not_found"
  };
}

export function buildBootEnvelope({
  deviceClass = process.env.EVERCRAFT_OS_DEVICE_CLASS || "generic_linux_user_device",
  mode = process.env.EVERCRAFT_OS_MODE || "owner_userspace"
} = {}) {
  const manifest = loadManifest();
  const components = manifest.components.map((component) => inspectComponent(component));
  const missingRequired = components.filter(
    (component) => component.required && component.source_state !== "present"
  );

  return {
    schema: "evercraft.os.boot-envelope.v1",
    product: manifest.product,
    phase: manifest.phase,
    device_class: deviceClass,
    mode,
    substrate: {
      kernel_strategy: manifest.kernel_strategy,
      privileged_kernel_replacement_required: manifest.privileged_kernel_replacement_required
    },
    authority: {
      identity: manifest.identity_authority,
      authorization: manifest.authorization_authority,
      mission: manifest.mission_authority,
      commerce: manifest.commerce_authority,
      human_front_door: manifest.human_front_door
    },
    components,
    source_preflight: missingRequired.length === 0 ? "pass" : "hold",
    missing_required_components: missingRequired.map((component) => component.id),
    execution_authority_granted: false,
    runtime_health_claimed: false,
    external_provider_dependency_claimed: false,
    invariants: manifest.invariants
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(buildBootEnvelope(), null, 2) + "\n");
}
