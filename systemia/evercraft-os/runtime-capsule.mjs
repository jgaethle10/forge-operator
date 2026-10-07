import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { compileEvercraftOsApp } from "./app-package.mjs";
import { packageFingerprint } from "./install-ledger.mjs";

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function safeProductKey(value) {
  const key = requiredText(value, "product_key");
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(key)) throw new Error("product_key_path_unsafe");
  return key;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}

export class EvercraftOsCapabilityCapsules {
  constructor({ rootDir, installLedger } = {}) {
    if (!rootDir) throw new Error("capsule_root_dir_required");
    if (!installLedger) throw new Error("capsule_install_ledger_required");
    this.rootDir = path.resolve(rootDir);
    this.installLedger = installLedger;
  }

  capsulePath(productKey, nodeId) {
    const product = safeProductKey(productKey);
    const node = requiredText(nodeId, "node_id");
    const suffix = createHash("sha256").update(node).digest("hex").slice(0, 16);
    const target = path.resolve(this.rootDir, product + "--" + suffix);
    if (!target.startsWith(this.rootDir + path.sep)) throw new Error("capsule_path_escape");
    return target;
  }

  expectedManifest(productKey, nodeId) {
    const product = safeProductKey(productKey);
    const node = requiredText(nodeId, "node_id");
    const installed = this.installLedger.currentState(product, node);
    if (!installed.installed) throw new Error("capsule_app_not_installed");

    const { app, package_fingerprint } = packageFingerprint(product);
    if (package_fingerprint !== installed.package_fingerprint) {
      throw new Error("capsule_installed_package_contract_drift");
    }

    const body = {
      schema: "evercraft.os.capability-capsule.v1",
      product_key: product,
      display_name: app.display_name,
      product_class: app.product_class,
      contract_version: app.contract_version,
      node_id: node,
      package_fingerprint,
      runtime_model: "mediated_capability",
      launch: {
        authority: "systemia",
        specialist_slug: app.specialist_slug,
        systemia_admission_required: true,
        execution_gate_required: app.os_services.execution.gate_required,
        direct_shell_allowed: false,
        arbitrary_process_spawn_allowed: false
      },
      network: {
        authority: "evercraft_network",
        direct_socket_access_allowed: false,
        transport_must_be_mediated: true
      },
      credentials: {
        raw_provider_credentials_available: false,
        provider_access_must_use_governed_boundary: true
      },
      commerce: {
        authority: "evercraft_payments",
        direct_settlement_provider_access_allowed: false,
        payment_authority_granted: false
      },
      context: {
        authority: "context_fabric",
        namespace: app.os_services.context.namespace,
        read_scope: app.os_services.context.read_scope,
        write_scope: app.os_services.context.write_scope,
        access_granted: false
      },
      device_capabilities: {
        requested: app.device_capabilities.requested,
        granted: [],
        implicit_grants_allowed: false
      },
      filesystem: {
        arbitrary_host_filesystem_access_allowed: false,
        writable_paths: []
      },
      runtime_state: {
        executable_materialized: false,
        process_started: false,
        service_enabled: false,
        runtime_health_claimed: false
      }
    };

    return {
      ...body,
      manifest_hash: sha256(body)
    };
  }

  inspect(productKey, nodeId) {
    const target = this.capsulePath(productKey, nodeId);
    const manifestFile = path.join(target, "manifest.json");
    if (!fs.existsSync(manifestFile)) {
      return {
        schema: "evercraft.os.capability-capsule-state.v1",
        product_key: safeProductKey(productKey),
        node_id: requiredText(nodeId, "node_id"),
        materialized: false,
        integrity: "not_present"
      };
    }

    const manifest = readJson(manifestFile);
    const { manifest_hash, ...body } = manifest;
    if (manifest_hash !== sha256(body)) throw new Error("capsule_integrity_mismatch");

    const expected = this.expectedManifest(productKey, nodeId);
    if (expected.manifest_hash !== manifest_hash) throw new Error("capsule_manifest_contract_mismatch");

    return {
      schema: "evercraft.os.capability-capsule-state.v1",
      product_key: manifest.product_key,
      node_id: manifest.node_id,
      materialized: true,
      integrity: "verified",
      package_fingerprint: manifest.package_fingerprint,
      manifest_hash,
      runtime_state: manifest.runtime_state,
      path: target
    };
  }

  materialize(productKey, nodeId) {
    const target = this.capsulePath(productKey, nodeId);
    const expected = this.expectedManifest(productKey, nodeId);

    if (fs.existsSync(target)) {
      const state = this.inspect(productKey, nodeId);
      return {
        state: "already_materialized",
        mutation_performed: false,
        capsule: state
      };
    }

    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
    const temp = path.join(this.rootDir, ".capsule-" + randomUUID());
    fs.mkdirSync(temp, { mode: 0o700 });

    try {
      writeJson(path.join(temp, "manifest.json"), expected);
      fs.renameSync(temp, target);
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }

    return {
      state: "materialized",
      mutation_performed: true,
      capsule: this.inspect(productKey, nodeId),
      executable_materialized: false,
      process_started: false,
      service_enabled: false
    };
  }

  reconcile(productKey, nodeId) {
    const target = this.capsulePath(productKey, nodeId);
    const installed = this.installLedger.currentState(productKey, nodeId);

    if (installed.installed) {
      return this.materialize(productKey, nodeId);
    }

    if (!fs.existsSync(target)) {
      return {
        state: "absent",
        mutation_performed: false,
        materialized: false
      };
    }

    const before = this.inspect(productKey, nodeId);
    fs.rmSync(target, { recursive: true, force: true });

    return {
      state: "removed_after_authorized_uninstall",
      mutation_performed: true,
      materialized: false,
      prior_manifest_hash: before.manifest_hash,
      binary_removal_claimed: false,
      runtime_stop_claimed: false
    };
  }
}
